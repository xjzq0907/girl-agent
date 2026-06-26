import type { ChatContentPart } from "../llm/index.js";
import type { IncomingMedia } from "../telegram/index.js";

const REFUSALS: Record<string, string[]> = {
  photo: ["现在不想拍照", "不，不拍照片", "我现在状态不好", "也许待会儿", "别再催照片了"],
  video: ["不想拍视频", "不，不拍了", "懒得拍", "现在不行", "我没心情"],
  voice: ["不想发语音", "不，语音现在不行", "我现在不方便说话", "发文字吧", "我发语音不方便"],
  video_note: ["不想拍圈视频", "不拍圈视频了", "不，我现在状态不好", "也许待会儿", "懒得拍圈视频"],
  sticker: ["哈哈", "呃", "))", "无语", "你行啊"],
  document: ["这是什么", "我才不会打开", "正常发过来", "不想看文件"]
};

export function outgoingMediaRefusal(kind: keyof typeof REFUSALS): string {
  const list = REFUSALS[kind] ?? REFUSALS.document;
  return list[Math.floor(Math.random() * list.length)] ?? "不想";
}

export function describeIncomingMedia(media?: IncomingMedia): string {
  if (!media) return "";
  const base = media.kind === "photo" ? "[他发了张照片]"
    : media.kind === "video" ? "[他发了个视频]"
    : media.kind === "voice" ? "[他发了条语音]"
    : media.kind === "video_note" ? "[他发了个圈视频]"
    : media.kind === "sticker" ? `[他发了个贴纸${media.emoji ? ` ${media.emoji}` : ""}]`
    : "[他发了个文件]";
  return media.caption ? `${base}: ${media.caption}` : base;
}

export function mediaPromptFragment(media?: IncomingMedia): string {
  if (!media) return "";
  if (media.kind === "photo") return "# 收到的照片\n他发来一张照片。如果模型能看到图片——针对照片的具体内容做出反应，简短自然地回复，像真人一样。不要说你在分析图片。如果照片看不太懂——就自然地回应。\n\n# 无搜索的梗图识别\n检查你是否能认出这张照片是已知的网络梗、梗模板、病毒图片或流行文化视觉梗。这不是反向图片搜索：只使用你自己的视觉知识。只有在高度确信时才提及梗/梗的出处。如果有疑问——就当作普通照片处理，不要称之为梗图。";
  if (media.kind === "voice") return "# 收到的语音\n他发来一条语音。如果没有文字转写，就像一个不方便听语音的人那样回应：让对方发文字或者敷衍一下。";
  if (media.kind === "video_note") return "# 收到的圈视频\n他发来一个圈视频。不要承诺回发一个圈视频。你可以懒散地/不好意思地回应。";
  if (media.kind === "video") return "# 收到的视频\n他发来一个视频。谨慎回应；如果细节没有传给模型，不要假装看到了细节。";
  if (media.kind === "sticker") return "# 收到的贴纸\n他发来一个贴纸。如果模型能看到贴纸图像——针对具体的情绪/画面做出反应，而不仅仅是对emoji回应。可以用表情/简短的话回复，或者在合适的情况下也回一个贴纸。如果是知名的梗贴纸/角色——只有在高度确信时才考虑这一点，不要猜测。";
  return "# 收到的文件\n他发来一个文件。如果内容没有传给你，不要打开也不要承诺会仔细查看。";
}

export function memeDetectionInstruction(media?: IncomingMedia): string {
  if (!media || (media.kind !== "photo" && media.kind !== "sticker")) return "";
  return "检查你是否能认出这张图片是已知的梗/梗模板/病毒图片。如果确信——将其作为回复的上下文。如果不确信——不要称之为梗图，当作普通图片来回应。";
}

export function imagePartFromMedia(media?: IncomingMedia): ChatContentPart | undefined {
  if (!media || (media.kind !== "photo" && media.kind !== "sticker") || !media.mimeType || !media.base64) return undefined;
  return {
    type: "image",
    mimeType: media.mimeType,
    data: media.base64
  };
}
