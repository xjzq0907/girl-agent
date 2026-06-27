#!/usr/bin/env sh
# girl-agent — 通用安装脚本
#
#   curl -fsSL https://raw.githubusercontent.com/TheSashaDev/girl-agent/master/scripts/install.sh | sh
#
# 这个脚本会做什么：
#   1. 机器上不需要预先安装 node —— 会下载官方 Node.js 22 LTS 到本地
#      目录 ~/.local/share/girl-agent/runtime/（无需 sudo，不写 /usr/local）。
#   2. 把 `@thesashadev/girl-agent` 包也装到同一个隔离的 prefix。
#   3. 把 shim 脚本 `girl-agent` 放到 ~/.local/bin/。
#   4. 如果检测到 docker —— 提示使用 docker 模式（更少依赖系统，
#      彻底避免版本冲突）。
#   5. 不会动现有的 node、npm，不做任何全局改动。
#
# 支持的平台：linux x86_64/aarch64、macOS x86_64/arm64、WSL、Android (Termux)。
# 原生 Windows —— 请使用 GitHub releases 里的 .exe 安装器。

set -eu

# -------- 彩色输出 --------
_color() { if [ -t 2 ] && command -v tput >/dev/null 2>&1; then printf "%s" "$(tput "$@")"; fi; }
B=$(_color bold); D=$(_color sgr0); G=$(_color setaf 2); R=$(_color setaf 1); Y=$(_color setaf 3)
say() { printf "%s[girl-agent]%s %s\n" "$B" "$D" "$1" >&2; }
ok()  { printf "%s[girl-agent]%s %s%s%s\n" "$B" "$D" "$G" "$1" "$D" >&2; }
warn(){ printf "%s[girl-agent]%s %s%s%s\n" "$B" "$D" "$Y" "$1" "$D" >&2; }
die() { printf "%s[girl-agent]%s %s错误：%s %s\n" "$B" "$D" "$R" "$D" "$1" >&2; exit 1; }

# -------- CLI 参数 --------
MODE="auto"        # auto | local | docker
NODE_VERSION="22.12.0"
PKG_VERSION="latest"
TERMUX_NATIVE_PREFIX="${PREFIX:-}"
INSTALL_PREFIX="$HOME/.local/share/girl-agent"
BIN_DIR="$HOME/.local/bin"
DATA_DIR="$HOME/.local/share/girl-agent/data"
DOCKER_IMAGE="ghcr.io/thesashadev/girl-agent:latest"
SKIP_PATH=0
QUIET=0

while [ $# -gt 0 ]; do
  case "$1" in
    --docker) MODE="docker" ;;
    --local) MODE="local" ;;
    --node-version=*) NODE_VERSION="${1#*=}" ;;
    --version=*) PKG_VERSION="${1#*=}" ;;
    --prefix=*) INSTALL_PREFIX="${1#*=}" ;;
    --bin-dir=*) BIN_DIR="${1#*=}" ;;
    --skip-path) SKIP_PATH=1 ;;
    --quiet|-q) QUIET=1 ;;
    -h|--help) cat <<EOF
girl-agent 通用安装脚本

用法：
  curl -fsSL .../install.sh | sh
  curl -fsSL .../install.sh | sh -s -- --docker
  curl -fsSL .../install.sh | sh -s -- --local --node-version=22.12.0

参数：
  --docker            强制使用 docker 模式
  --local             强制使用本地 node + npm install
  --node-version=X.Y.Z   指定 node 版本（默认 ${NODE_VERSION}）
  --version=X.Y.Z     指定 @thesashadev/girl-agent 版本（默认 latest）
  --prefix=<dir>      安装位置（默认 \$HOME/.local/share/girl-agent）
  --bin-dir=<dir>     shim 脚本位置（默认 \$HOME/.local/bin）
  --skip-path         不修改 ~/.bashrc / ~/.zshrc
  -q, --quiet         减少输出

安装后：
  girl-agent              # 启动 ink 向导（需要 TTY）
  girl-agent server --help

卸载：
  rm -rf "${INSTALL_PREFIX}" "${BIN_DIR}/girl-agent"
EOF
      exit 0 ;;
    *) die "未知参数：$1（用 --help 查看帮助）" ;;
  esac
  shift
done

# -------- 检测平台 --------
# Termux 不是普通的 linux：nodejs.org 上的二进制用不了（ABI 不同），
# 需要用 Termux 原生 node，通过 `pkg install nodejs` 装。
# Termux 中 \$PREFIX 环境变量指向 Termux 系统的 prefix
# (/data/data/com.termux/files/usr)。我们不用它当 install-prefix，
# 避免破坏 npm global install 和 PATH。
is_termux() {
  if [ -n "${TERMUX_VERSION:-}" ]; then return 0; fi
  if [ -d "/data/data/com.termux/files/usr" ]; then return 0; fi
  if [ -n "$TERMUX_NATIVE_PREFIX" ] && [ -d "$TERMUX_NATIVE_PREFIX/bin" ] && command -v termux-info >/dev/null 2>&1; then return 0; fi
  return 1
}
detect_os() {
  if is_termux; then echo "termux"; return; fi
  case "$(uname -s)" in
    Linux*) echo "linux" ;;
    Darwin*) echo "darwin" ;;
    CYGWIN*|MINGW*|MSYS*) echo "win" ;;
    *) die "不支持的操作系统：$(uname -s)。Windows 请使用 .exe 安装器。" ;;
  esac
}
detect_arch() {
  case "$(uname -m)" in
    x86_64|amd64) echo "x64" ;;
    aarch64|arm64) echo "arm64" ;;
    armv7l) echo "armv7l" ;;
    *) die "不支持的架构：$(uname -m)" ;;
  esac
}

OS=$(detect_os)
ARCH=$(detect_arch)
say "检测到：${OS}-${ARCH}"

# Termux：使用 pkg 自带的原生 node，全局安装（到 \$PREFIX/lib/node_modules）。
# PATH 已经包含 \$PREFIX/bin —— 无需额外配置。
if [ "$OS" = "termux" ]; then
  TERMUX_RUNTIME_PREFIX="${TERMUX_NATIVE_PREFIX:-/data/data/com.termux/files/usr}"
  BIN_DIR="${TERMUX_RUNTIME_PREFIX}/bin"
  # runtime 使用 os.homedir()/.local/share/girl-agent/data —— 在 Termux 上是合法路径
  DATA_DIR="$HOME/.local/share/girl-agent/data"
  MODE="termux"
  say "检测到 Termux（Android）—— runtime 在 ${TERMUX_RUNTIME_PREFIX}，data 在 $DATA_DIR"
fi

# -------- 决定模式 --------
if [ "$MODE" = "auto" ]; then
  if [ "$OS" = "termux" ]; then
    say "Termux —— 不支持 docker，使用 pkg 自带的原生 node"
    MODE="termux"
  elif command -v docker >/dev/null 2>&1; then
    say "检测到 docker —— 使用 docker 模式（无版本冲突）"
    MODE="docker"
  else
    say "未检测到 docker —— 使用本地模式（隔离的 node）"
    MODE="local"
  fi
elif [ "$OS" = "termux" ] && [ "$MODE" != "termux" ]; then
  warn "Termux 上只能使用 termux 模式（不支持 --docker/--local），已自动切换"
  MODE="termux"
fi

# -------- 通用：创建目录 --------
mkdir -p "$BIN_DIR" "$DATA_DIR"

# -------- docker 模式 --------
install_docker() {
  command -v docker >/dev/null 2>&1 || die "未安装 docker。请安装 docker desktop / docker engine，或改用 --local。"
  say "正在拉取 ${DOCKER_IMAGE}（约需 30-60 秒）..."
  if ! docker pull "$DOCKER_IMAGE" >&2; then
    warn "镜像拉取失败（私有包或没有网络）"
    warn "切换到本地模式（隔离的 node）..."
    install_local
    return
  fi

  cat >"$BIN_DIR/girl-agent" <<'SHIM'
#!/usr/bin/env sh
# girl-agent docker shim
set -eu
IMAGE="${GIRL_AGENT_IMAGE:-ghcr.io/thesashadev/girl-agent:latest}"
DATA="${GIRL_AGENT_DATA_HOST:-$HOME/.local/share/girl-agent/data}"
mkdir -p "$DATA"

# 如果 stdin/stdout 都是 TTY —— 交互式运行（ink 向导可用）。
# 否则 —— 普通 pipe 模式（给 systemd / cron / docker logs 用）。
TTY_FLAGS="-i"
if [ -t 0 ] && [ -t 1 ]; then
  TTY_FLAGS="-it"
fi

exec docker run --rm $TTY_FLAGS \
  -v "$DATA:/data" \
  -p "${GIRL_AGENT_PORT:-3000}:${GIRL_AGENT_PORT:-3000}" \
  --user "$(id -u):$(id -g)" \
  -e "GIRL_AGENT_DATA=/data" \
  -e "GIRL_AGENT_HOST=0.0.0.0" \
  -e "HOME=/tmp" \
  -e "TERM=${TERM:-xterm-256color}" \
  "$IMAGE" "$@"
SHIM
  chmod +x "$BIN_DIR/girl-agent"
  ok "docker shim 已安装：${BIN_DIR}/girl-agent"
}

# -------- 本地模式 --------
install_local() {
  say "正在把隔离的 node v${NODE_VERSION} 装到 ${INSTALL_PREFIX}/runtime/"
  mkdir -p "$INSTALL_PREFIX/runtime"

  NODE_TARBALL_NAME="node-v${NODE_VERSION}-${OS}-${ARCH}.tar.xz"
  NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL_NAME}"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT

  if [ -x "$INSTALL_PREFIX/runtime/bin/node" ] && [ "$("$INSTALL_PREFIX/runtime/bin/node" --version 2>/dev/null)" = "v${NODE_VERSION}" ]; then
    say "node v${NODE_VERSION} 已解压，跳过。"
  else
    say "正在下载 ${NODE_URL}"
    if command -v curl >/dev/null 2>&1; then
      curl -fsSL "$NODE_URL" -o "$TMP/node.tar.xz" || die "下载 node 失败"
    elif command -v wget >/dev/null 2>&1; then
      wget -q "$NODE_URL" -O "$TMP/node.tar.xz" || die "下载 node 失败"
    else
      die "既没有 curl 也没有 wget"
    fi
    say "解压中..."
    tar -xJf "$TMP/node.tar.xz" -C "$TMP" || die "tar -xJ 失败（需要 xz）"
    rm -rf "$INSTALL_PREFIX/runtime"
    mv "$TMP/node-v${NODE_VERSION}-${OS}-${ARCH}" "$INSTALL_PREFIX/runtime"
  fi

  NODE="$INSTALL_PREFIX/runtime/bin/node"
  NPM="$INSTALL_PREFIX/runtime/bin/npm"
  [ -x "$NODE" ] || die "在 $INSTALL_PREFIX/runtime/bin/ 中找不到 node"

  say "正在把 @thesashadev/girl-agent@${PKG_VERSION} 装到本地 prefix..."
  mkdir -p "$INSTALL_PREFIX/lib"
  # `npm install --prefix <dir>` —— 隔离安装，不动全局
  "$NODE" "$NPM" install --prefix "$INSTALL_PREFIX/lib" --no-audit --no-fund --silent "@thesashadev/girl-agent@${PKG_VERSION}" \
    || die "npm install 失败"

  cat >"$BIN_DIR/girl-agent" <<EOF
#!/usr/bin/env sh
# girl-agent local node shim — 由 install.sh 生成
exec "${INSTALL_PREFIX}/runtime/bin/node" "${INSTALL_PREFIX}/lib/node_modules/@thesashadev/girl-agent/dist/cli.js" "\$@"
EOF
  chmod +x "$BIN_DIR/girl-agent"
  ok "本地安装完成：${BIN_DIR}/girl-agent"
  ok "node:    $("$NODE" --version)（隔离版）"
  ok "package: ${PKG_VERSION}"
}

# -------- termux 模式 --------
# 在 Termux 中不从 nodejs.org 下载 —— 那里的二进制链接的是 glibc，而 Termux 没有（用 bionic）。
# 改用 `pkg install nodejs` 提供的原生 node。
install_termux() {
  if ! command -v node >/dev/null 2>&1; then
    say "Termux 中未找到 node —— 用 pkg 安装..."
    if ! command -v pkg >/dev/null 2>&1; then
      die "找不到 pkg —— 这不是 Termux？请从 F-Droid 安装 Termux：https://f-droid.org/packages/com.termux/"
    fi
    pkg update -y >&2 || warn "pkg update 出错，继续"
    pkg install -y nodejs >&2 || die "pkg install nodejs 失败"
  fi
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [ "$NODE_MAJOR" -lt 18 ]; then
    die "Termux 中找到 $(node --version)，需要 Node.js 18.18+（pkg upgrade && pkg install nodejs）"
  fi
  if [ "$NODE_MAJOR" -lt 20 ]; then
    warn "Termux 中找到 $(node --version)。可以运行，但建议升级：pkg upgrade && pkg install nodejs"
  fi
  say "node: $(node --version)（termux-native）"

  # Termux 中全局安装直接可用 —— npm 会写入 \$PREFIX/lib/node_modules，
  # 并把 shim 放到 \$PREFIX/bin。无需 sudo。
  say "正在全局安装 @thesashadev/girl-agent@${PKG_VERSION}（Termux 中是 ${TERMUX_RUNTIME_PREFIX}）"
  npm install -g --no-audit --no-fund --omit=optional --ignore-scripts "@thesashadev/girl-agent@${PKG_VERSION}" >&2 \
    || die "npm install -g 失败"

  if ! command -v girl-agent >/dev/null 2>&1; then
    NPM_PREFIX="$(npm prefix -g 2>/dev/null || printf "%s" "$TERMUX_RUNTIME_PREFIX")"
    warn "girl-agent 已安装，但命令不在 PATH 中"
    warn "重启 Termux 会话或手动：export PATH=\"${NPM_PREFIX}/bin:\$PATH\""
    warn "临时运行：${NPM_PREFIX}/bin/girl-agent"
  fi

  ok "Termux 安装完成"
  ok "node:    $(node --version)"
  ok "package: ${PKG_VERSION}"
  ok "data:    $DATA_DIR"
}

# -------- 执行安装 --------
case "$MODE" in
  docker) install_docker ;;
  local) install_local ;;
  termux) install_termux ;;
  *) die "未知模式：$MODE" ;;
esac

# -------- PATH 提示 --------
if [ "$OS" = "termux" ]; then
  # 在 Termux 中 \$PREFIX/bin 始终在 PATH 中 —— 无需额外添加
  ok "Termux 的 PATH 已经包含 npm-prefix/bin"
else
case ":$PATH:" in
  *":$BIN_DIR:"*) ok "${BIN_DIR} 已经在 PATH 中" ;;
  *)
    if [ "$SKIP_PATH" = "1" ]; then
      warn "${BIN_DIR} 不在 PATH 中；检测到 --skip-path，未做任何修改"
      warn "请通过完整路径运行：${BIN_DIR}/girl-agent"
    else
      RC=""
      [ -f "$HOME/.zshrc" ] && RC="$HOME/.zshrc"
      [ -z "$RC" ] && [ -f "$HOME/.bashrc" ] && RC="$HOME/.bashrc"
      [ -z "$RC" ] && [ -f "$HOME/.profile" ] && RC="$HOME/.profile"
      if [ -n "$RC" ]; then
        if ! grep -qF ".local/bin" "$RC" 2>/dev/null; then
          printf '\n# added by girl-agent install.sh\nexport PATH="$HOME/.local/bin:$PATH"\n' >>"$RC"
          ok "已经把 .local/bin 写入 PATH，文件：$RC"
          warn "重启 shell 或手动执行：export PATH=\"\$HOME/.local/bin:\$PATH\""
        else
          ok "$RC 中已包含 .local/bin"
        fi
      else
        warn "找不到 shell rc 文件，请手动添加：export PATH=\"\$HOME/.local/bin:\$PATH\""
      fi
    fi
    ;;
esac
fi

if [ "$OS" = "termux" ]; then
  cat >&2 <<EOF

完成（Termux）。接下来：

  ${B}girl-agent${D}                    # 在 http://localhost:3000 打开 WebUI
  ${B}girl-agent server --help${D}      # 服务器模式（配置文件 / 环境变量）

profile 存放在：${DATA_DIR}
在同一台手机的浏览器中打开 WebUI：http://localhost:3000
避免锁屏后进程被杀：
  ${B}termux-wake-lock${D}
检查存储权限：
  ${B}termux-setup-storage${D}

更新：npm install -g @thesashadev/girl-agent@latest
卸载：npm uninstall -g @thesashadev/girl-agent

EOF
else
  cat >&2 <<EOF

完成。接下来：

  ${B}girl-agent${D}                    # 在 http://localhost:3000 打开 WebUI
  ${B}girl-agent server --help${D}      # 服务器模式（配置文件 / 环境变量）
  ${B}girl-agent server --print-config > bot.json${D}
  ${B}girl-agent server --config bot.json --headless${D}

profile 存放在：${DATA_DIR}
更新：重新运行 install.sh
卸载：rm -rf ${INSTALL_PREFIX} ${BIN_DIR}/girl-agent

EOF
fi
