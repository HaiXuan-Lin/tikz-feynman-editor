#!/usr/bin/env python3
"""Render ICO and native ICNS directly from the editable SVG source.

Requires Pillow, librsvg's rsvg-convert, and macOS iconutil.
Ordinary application builds use the committed assets and need none of these.
"""

from pathlib import Path
from tempfile import TemporaryDirectory
import shutil
import subprocess

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'img/app-icon.svg'
ICO_SIZES = (16, 24, 32, 48, 64, 128, 256)


def main():
    renderer = shutil.which('rsvg-convert')
    iconutil = shutil.which('iconutil')
    if not renderer or not iconutil:
        raise SystemExit('Install librsvg and Pillow; run on macOS with iconutil.')

    with TemporaryDirectory(prefix='feynman-icon-') as temporary:
        work = Path(temporary)
        sizes = sorted(set(ICO_SIZES) | {512, 1024})
        for size in sizes:
            subprocess.run([
                renderer, '--width', str(size), '--height', str(size),
                '--output', str(work / f'{size}.png'), str(SOURCE),
            ], check=True)

        images = []
        for size in ICO_SIZES:
            with Image.open(work / f'{size}.png') as image:
                images.append(image.convert('RGBA'))
        images[-1].save(
            work / 'favicon.ico', format='ICO',
            sizes=[(size, size) for size in ICO_SIZES],
            append_images=images[:-1],
        )

        iconset = work / 'AppIcon.iconset'
        iconset.mkdir()
        for size in (16, 32, 128, 256, 512):
            for scale in (1, 2):
                suffix = '@2x' if scale == 2 else ''
                shutil.copyfile(
                    work / f'{size * scale}.png',
                    iconset / f'icon_{size}x{size}{suffix}.png',
                )
        subprocess.run([
            iconutil, '-c', 'icns', str(iconset),
            '-o', str(work / 'AppIcon.icns'),
        ], check=True)
        shutil.copyfile(work / 'favicon.ico', ROOT / 'favicon.ico')
        shutil.copyfile(work / 'AppIcon.icns', ROOT / 'macos/AppIcon.icns')

    print('Rendered favicon.ico and macos/AppIcon.icns from img/app-icon.svg')


if __name__ == '__main__':
    main()
