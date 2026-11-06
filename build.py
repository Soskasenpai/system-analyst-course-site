#!/usr/bin/env python3
"""Собирает assets/content.js из Markdown-файлов папки «Курс».

Запускать нужно только после правки .md-файлов:  py build.py
Для просмотра сайта сборка не нужна — готовый content.js лежит в репозитории.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent
SRC = ROOT / "Курс"
OUT = ROOT / "assets" / "content.js"


def read(name: str) -> str:
    return (SRC / name).read_text(encoding="utf-8").replace("\r\n", "\n")


def split_modules(text: str) -> list[dict]:
    modules = []
    for chunk in re.split(r"\n---\n", text):
        m = re.search(r"^## (M\d+)\.\s+(.+)$", chunk, re.M)
        if not m:
            continue
        title_line = m.group(2)
        week = re.search(r"\((недел[яи]\s+[\d–-]+)\)", title_line)
        source = re.search(r"—\s*\*(.+?)\*", title_line)
        title = re.split(r"\s+\(недел|\s+—", title_line)[0].strip()
        body = chunk[m.end():].strip()
        topics = [
            {"id": t.group(1), "desc": t.group(2).strip()}
            for t in re.finditer(r"^- (\d+\.\d+)\s+(.+)$", body, re.M)
        ]
        # M13/M14 в исходнике идут подряд без разделителя
        modules.append({
            "id": m.group(1).lower(),
            "code": m.group(1),
            "title": title,
            "week": week.group(1) if week else "",
            "source": source.group(1) if source else "",
            "topics": topics,
            "md": f"# {m.group(1)}. {title}\n\n{body}",
        })
    return modules


def main() -> None:
    topics = read("02_Топики.md")
    # M13 и M14 не разделены «---»: делим по заголовкам
    topics = re.sub(r"\n(## M14\.)", r"\n---\n\1", topics)
    intro = topics.split("\n---\n", 1)[0]

    data = {
        "plan": read("00_План_обучения.md"),
        "actual": read("01_Актуальное_для_2027.md"),
        "topicsIntro": intro,
        "klimenko": read("03_Конспект_Клименко.md"),
        "modules": split_modules(topics),
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(
        "window.COURSE = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8",
    )
    print(f"OK: {OUT} ({len(data['modules'])} модулей)")


if __name__ == "__main__":
    main()
