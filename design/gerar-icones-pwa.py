"""
Gera os ícones do PWA (Fase 9) em apps/web/public/icons/.

É ferramenta de asset, não dependência do projeto: roda à mão quando a marca
mudar e o resultado (os PNG) é o que vai para o repositório.

    python design/gerar-icones-pwa.py

Requer Pillow. Saída:
  icon-192.png / icon-512.png          purpose "any"    — cifrão centralizado
  icon-maskable-192/512.png            purpose "maskable" — glifo dentro da
                                       zona segura (80%), porque o Android
                                       recorta o ícone em círculo
  apple-touch-icon.png (180)           iOS arredonda sozinho, sem transparência
  favicon.ico (16/32/48)
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

RAIZ = Path(__file__).resolve().parent.parent
SAIDA = RAIZ / "apps" / "web" / "public" / "icons"

ROXO = (130, 10, 209, 255)  # --primary do design system (#820AD1)
BRANCO = (255, 255, 255, 255)
FONTE = "C:/Windows/Fonts/arialbd.ttf"


def desenhar(tamanho: int, raio_ratio: float, glifo_ratio: float) -> Image.Image:
    img = Image.new("RGBA", (tamanho, tamanho), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    raio = int(tamanho * raio_ratio)
    if raio > 0:
        draw.rounded_rectangle([0, 0, tamanho - 1, tamanho - 1], radius=raio, fill=ROXO)
    else:
        draw.rectangle([0, 0, tamanho - 1, tamanho - 1], fill=ROXO)

    fonte = ImageFont.truetype(FONTE, int(tamanho * glifo_ratio))
    caixa = draw.textbbox((0, 0), "$", font=fonte)
    largura, altura = caixa[2] - caixa[0], caixa[3] - caixa[1]
    draw.text(
        ((tamanho - largura) / 2 - caixa[0], (tamanho - altura) / 2 - caixa[1]),
        "$",
        font=fonte,
        fill=BRANCO,
    )
    return img


def main() -> None:
    SAIDA.mkdir(parents=True, exist_ok=True)

    for tamanho in (192, 512):
        # Raio de 22%: a mesma proporção dos cards de 20px do design system.
        desenhar(tamanho, 0.22, 0.62).save(SAIDA / f"icon-{tamanho}.png")
        # Maskable: fundo inteiro e glifo menor, para sobreviver ao recorte.
        desenhar(tamanho, 0.0, 0.44).save(SAIDA / f"icon-maskable-{tamanho}.png")

    desenhar(180, 0.0, 0.62).convert("RGB").save(SAIDA / "apple-touch-icon.png")

    favicon = desenhar(256, 0.22, 0.66)
    favicon.save(RAIZ / "apps" / "web" / "public" / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])

    for arquivo in sorted(SAIDA.iterdir()):
        print(f"ok  {arquivo.relative_to(RAIZ)}")


if __name__ == "__main__":
    main()
