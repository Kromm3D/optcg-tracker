# One Piece TCG — Card Image Database

Base de datos de imágenes y metadatos de cartas de **One Piece Trading Card Game**,
pensada para alimentar una app comunitaria de escaneo y gestión de colección.

Los datos e imágenes se obtienen de la API gratuita de [OPTCG API](https://www.optcgapi.com),
mantenida por DomoSlime.

---

## ¿Qué contiene este repo?

```
.
├── scripts/
│   └── build_card_database.py   # descarga datos+imágenes y genera el índice
├── images/
│   └── <SET>/<CODE>[_pN].png     # imágenes de cada carta y sus variantes
├── data/
│   ├── index.json                # índice que consume la app (lo genera el script)
│   └── index.example.json        # ejemplo de la estructura
└── README.md
```

## El índice (`data/index.json`)

Es el corazón del sistema. Mapea cada **código** de carta a todas sus **variantes**
(normal, alt art, parallel...). La app móvil funciona así:

1. El OCR lee el código impreso de la carta, p.ej. `OP14-033`.
2. La app busca ese código en `index.json`.
3. Muestra las **miniaturas de todas las variantes** de esa carta.
4. El usuario toca la que coincide con la carta que tiene en la mano.
5. La app abre el precio de esa versión en Cardmarket (EUR).

Esto resuelve el problema de las *alternate arts*: el OCR no puede distinguirlas
solo por el código, pero el usuario sí las distingue de un vistazo con las miniaturas.

## Cómo generar la base de datos

Necesitas Python 3 instalado.

```bash
# 1. Instala la dependencia
pip install requests

# 2. Genera solo el índice (rápido, para probar)
python scripts/build_card_database.py --no-images

# 3. Genera el índice + descarga todas las imágenes (tarda más)
python scripts/build_card_database.py
```

El script incluye una pausa entre llamadas para **no sobrecargar el servidor
gratuito de OPTCG API**. Por favor, no la reduzcas en exceso.

## Servir las imágenes a la app (jsDelivr)

Una vez subido este repo a GitHub, las imágenes se pueden servir gratis y rápido
a través del CDN de jsDelivr, sin tocar nada:

```
https://cdn.jsdelivr.net/gh/<TU_USUARIO>/<TU_REPO>@main/images/OP14/OP14-033.png
```

Igual para el índice:

```
https://cdn.jsdelivr.net/gh/<TU_USUARIO>/<TU_REPO>@main/data/index.json
```

`raw.githubusercontent.com` también funciona, pero jsDelivr cachea y va mucho
mejor cuando hay muchos usuarios.

---

## ⚠️ Aviso legal / atribución

One Piece y el One Piece Trading Card Game son marcas de **Eiichiro Oda, Bandai,
Shonen Jump y Viz Media**. Este repositorio es un proyecto comunitario sin ánimo
de lucro. Las imágenes de las cartas son propiedad de sus respectivos dueños.

Antes de **distribuir públicamente** imágenes de cartas o datos de precios,
revisa los términos de uso de las fuentes (OPTCG API, Cardmarket, Bandai).
Distribuir contenido con copyright a una comunidad tiene implicaciones distintas
a un uso personal. Esto no es asesoramiento legal; consúltalo si tienes dudas.

Apoya el lanzamiento oficial del juego, el manga y el anime.
