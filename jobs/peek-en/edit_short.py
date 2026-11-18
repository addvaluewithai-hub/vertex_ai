#!/usr/bin/env python3
"""Cut a Peek English Short from its shots, voice and word times (ffmpeg only, no GPU).

  python3 edit_short.py timeline.json out.mp4

timeline.json:
  {"dir": "<folder with the files>", "voice": "voice.wav", "words": "voice.transcript.json",
   "shots": [{"src": "a.mp4", "dur": 4.5, "gain": 0.8}            # video: its own sound at `gain`
             {"src": "b.png", "dur": 6, "move": "in" | "out" | "up" | "down", "audio": "sfx.wav"}],  # still
   "voice_parts": [{"from": 0.0, "to": 4.9, "at": 4.5}],           # voice seconds [from, to) placed at `at`
   "end_card": {"dur": 2.5, "bg": "c.png", "title": "FIELD REPORT #1", "line": "FOLLOW FOR REPORT #2"}}

Captions are burned in from the word times: 1-3 words at a time, big, in the lower-middle safe area.
"""
import json, subprocess, sys, os

W, H, FPS = 1080, 1920, 30


def run(cmd):
    subprocess.run(cmd, check=True)


def still_clip(src, dur, move, out, audio=None):
    n = int(round(dur * FPS))
    z = {"in": f"zoom='1+0.10*on/{n}'", "out": f"zoom='1.10-0.10*on/{n}'"}.get(move, "zoom='1.06'")
    x, y = "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"
    if move == "up":
        y = f"(ih-ih/zoom)*(1-on/{n})"
    if move == "down":
        y = f"(ih-ih/zoom)*on/{n}"
    vf = (f"scale={W*2}:{H*2}:force_original_aspect_ratio=increase,crop={W*2}:{H*2},"
          f"zoompan={z}:x='{x}':y='{y}':d={n}:s={W}x{H}:fps={FPS},format=yuv420p")
    sound = ["-i", audio] if audio else ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
    run(["ffmpeg", "-loglevel", "error", "-y", "-loop", "1", "-i", src, *sound, "-vf", vf,
         "-af", "aresample=48000,aformat=channel_layouts=stereo,apad", "-t", f"{dur}", "-c:v", "libx264",
         "-preset", "medium", "-crf", "18", "-c:a", "aac", out])


def video_clip(src, dur, gain, out):
    vf = f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},fps={FPS},format=yuv420p,tpad=stop_mode=clone:stop_duration=5"
    has_audio = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index",
                                "-of", "csv=p=0", src], capture_output=True, text=True).stdout.strip()
    cmd = ["ffmpeg", "-loglevel", "error", "-y", "-i", src]
    if has_audio:
        af = f"volume={gain},aresample=48000,apad"
        cmd += ["-vf", vf, "-af", af, "-ac", "2"]
    else:
        cmd += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-vf", vf, "-map", "0:v", "-map", "1:a"]
    cmd += ["-t", f"{dur}", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", out]
    run(cmd)


def end_card(card, out):
    bg, dur = card["bg"], card["dur"]
    def esc(s):
        return s.replace(":", r"\:").replace("'", r"\'")
    vf = (f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},boxblur=20:2,eq=brightness=-0.25,"
          f"drawtext=font='Inter Black':text='{esc(card['title'])}':fontsize=96:fontcolor=white:x=(w-tw)/2:y=h*0.40,"
          f"drawtext=font='Inter Black':text='{esc(card['line'])}':fontsize=64:fontcolor=0xffe66d:x=(w-tw)/2:y=h*0.40+150,"
          f"fade=in:st=0:d=0.3,format=yuv420p")
    run(["ffmpeg", "-loglevel", "error", "-y", "-loop", "1", "-i", bg, "-f", "lavfi", "-i",
         "anullsrc=r=48000:cl=stereo", "-vf", vf, "-t", f"{dur}", "-r", f"{FPS}", "-c:v", "libx264",
         "-crf", "18", "-c:a", "aac", "-shortest", out])


def ass_time(t):
    t = max(0, t)
    return f"{int(t//3600)}:{int(t%3600//60):02d}:{t%60:05.2f}"


def captions(words, parts, out):
    lines = []
    for p in parts:
        ws = [w for w in words if p["from"] <= w["start_ms"] / 1000 < p["to"]]
        group = []
        for i, w in enumerate(ws):
            group.append(w)
            text = w["text"]
            last = i == len(ws) - 1
            if len(group) >= 3 or text[-1] in ".,?!:" or last:
                s = group[0]["start_ms"] / 1000 - p["from"] + p["at"]
                nxt = ws[i + 1]["start_ms"] / 1000 if not last else group[-1]["end_ms"] / 1000 + 0.4
                e = min(nxt, group[-1]["end_ms"] / 1000 + 0.6) - p["from"] + p["at"]
                lines.append((s, e, " ".join(g["text"] for g in group).upper()))
                group = []
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Inter Black,92,&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,7,3,2,80,80,620,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    with open(out, "w") as f:
        f.write(head)
        for s, e, t in lines:
            f.write(f"Dialogue: 0,{ass_time(s)},{ass_time(e)},Cap,,0,0,0,,{{\\fad(60,60)}}{t}\n")


def main(timeline_path, out):
    tl = json.load(open(timeline_path))
    d = tl["dir"]
    os.makedirs(os.path.join(d, "work"), exist_ok=True)
    parts = []
    for i, s in enumerate(tl["shots"]):
        o = os.path.join(d, "work", f"{i:02d}.mp4")
        src = os.path.join(d, s["src"])
        if src.endswith(".mp4"):
            video_clip(src, s["dur"], s.get("gain", 0.8), o)
        else:
            audio = os.path.join(d, s["audio"]) if s.get("audio") else None
            still_clip(src, s["dur"], s.get("move", "in"), o, audio)
        parts.append(o)
    if tl.get("end_card"):
        o = os.path.join(d, "work", "end.mp4")
        card = dict(tl["end_card"], bg=os.path.join(d, tl["end_card"]["bg"]))
        end_card(card, o)
        parts.append(o)
    lst = os.path.join(d, "work", "list.txt")
    open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
    picture = os.path.join(d, "work", "picture.mp4")
    run(["ffmpeg", "-loglevel", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", picture])

    words = json.load(open(os.path.join(d, tl["words"])))["words"]
    ass = os.path.join(d, "work", "captions.ass")
    captions(words, tl["voice_parts"], ass)

    voice = os.path.join(d, tl["voice"])
    inputs = ["-i", picture]
    chains, labels = [], ["[0:a]"]
    for k, p in enumerate(tl["voice_parts"]):
        inputs += ["-i", voice]
        ms = int(p["at"] * 1000)
        chains.append(f"[{k+1}:a]atrim={p['from']}:{p['to']},asetpts=PTS-STARTPTS,aresample=48000,"
                      f"aformat=channel_layouts=stereo,adelay={ms}|{ms}[v{k}]")
        labels.append(f"[v{k}]")
    mix = ";".join(chains) + f";{''.join(labels)}amix=inputs={len(labels)}:normalize=0,loudnorm=I=-14:TP=-1.5[a]"
    run(["ffmpeg", "-loglevel", "error", "-y", *inputs, "-filter_complex",
         f"[0:v]ass={ass}[v];{mix}", "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium",
         "-crf", "19", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out])
    print(out)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
