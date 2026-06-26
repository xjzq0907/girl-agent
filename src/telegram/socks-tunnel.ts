import * as net from "node:net";

export interface TunnelOpts {
  /** SOCKS5 代理地址 */
  proxyHost: string;
  /** SOCKS5 代理端口 */
  proxyPort: number;
  /** 目标主机（Telegram DC） */
  targetHost: string;
  /** 目标端口 */
  targetPort: number;
}

/**
 * 通过 SOCKS5 代理建立到目标主机的连接（无认证）。
 */
/** TCP keep-alive 配置：每 30s 探测一次，3 次失败判定断开 */
function enableKeepAlive(sock: net.Socket) {
  sock.setKeepAlive(true, 30_000);
}

function connectViaSocks(
  proxyHost: string,
  proxyPort: number,
  targetHost: string,
  targetPort: number,
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: proxyHost, port: proxyPort }, () => {
      enableKeepAlive(socket); // 防止代理空闲断开
      // Step 1: 发送 SOCKS5 握手（无认证）
      socket.write(Buffer.from([0x05, 0x01, 0x00]));

      let state: "handshake" | "request" | "connected" = "handshake";
      let buf = Buffer.alloc(0);

      const onData = (data: Buffer) => {
        buf = Buffer.concat([buf, data]);

        if (state === "handshake" && buf.length >= 2) {
          // Step 2: 服务器响应握手
          if (buf[0] !== 0x05 || buf[1] !== 0x00) {
            socket.destroy();
            return reject(new Error(`SOCKS5 handshake failed: ${buf.toString("hex")}`));
          }
          state = "request";
          buf = buf.subarray(2);
        }

        if (state === "request") {
          // Step 3: 发送连接请求
          const hostBytes = Buffer.from(targetHost, "utf8");
          const portBuf = Buffer.alloc(2);
          portBuf.writeUInt16BE(targetPort, 0);

          const request = Buffer.concat([
            Buffer.from([0x05, 0x01, 0x00, 0x03, hostBytes.length]), // VER, CMD, RSV, ATYP=DOMAIN, LEN
            hostBytes,
            portBuf,
          ]);
          socket.write(request);
          state = "connected";
          buf = Buffer.alloc(0);
        }

        if (state === "connected" && buf.length >= 10) {
          // Step 4: 服务器响应连接请求
          if (buf[0] !== 0x05) {
            socket.destroy();
            return reject(new Error(`SOCKS5 connect response invalid: ${buf.toString("hex")}`));
          }
          if (buf[1] !== 0x00) {
            const errCodes: Record<number, string> = {
              1: "general failure", 2: "connection not allowed", 3: "network unreachable",
              4: "host unreachable", 5: "connection refused", 6: "TTL expired",
              7: "command not supported", 8: "address type not supported",
            };
            socket.destroy();
            return reject(new Error(`SOCKS5 connect failed: ${errCodes[buf[1]] || `code ${buf[1]}`}`));
          }
          // 连接成功，移除 data 监听器，返回 socket
          socket.removeListener("data", onData);
          resolve(socket);
        }
      };

      socket.on("data", onData);
      socket.on("error", (err) => {
        socket.removeListener("data", onData);
        reject(err);
      });
    });

    socket.on("error", reject);
  });
}

/**
 * 创建本地 SOCKS5 TCP 隧道。
 * 监听 127.0.0.1:指定端口，每个连接通过 SOCKS5 代理转发到目标。
 */
export function createSocksTunnel(opts: TunnelOpts, listenPort?: number): Promise<{ port: number; close: () => Promise<void> }> {
  let active = true;
  const server = net.createServer((localSocket: net.Socket) => {
    if (!active) { localSocket.destroy(); return; }
    localSocket.on("error", () => {});

    connectViaSocks(opts.proxyHost, opts.proxyPort, opts.targetHost, opts.targetPort)
      .then((remoteSocket) => {
        if (!active) { remoteSocket.destroy(); localSocket.destroy(); return; }
        enableKeepAlive(localSocket);
        enableKeepAlive(remoteSocket);
        localSocket.pipe(remoteSocket);
        remoteSocket.pipe(localSocket);
        remoteSocket.on("error", () => { localSocket.destroy(); });
        localSocket.on("error", () => { remoteSocket.destroy(); });
        localSocket.on("close", () => { remoteSocket.destroy(); });
        remoteSocket.on("close", () => { localSocket.destroy(); });
      })
      .catch(() => {
        localSocket.destroy();
      });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort ?? 0, "127.0.0.1", () => {
      const addr = server.address() as net.AddressInfo;
      resolve({
        port: addr.port,
        close: () => {
          active = false;
          return new Promise<void>((r) => server.close(() => r()));
        },
      });
    });
  });
}
