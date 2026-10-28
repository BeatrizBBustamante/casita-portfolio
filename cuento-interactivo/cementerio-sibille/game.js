'use strict';

/* =========================================================================
   SIBILLE Y EL CEMENTERIO LIMPIO
   Juego 2D top-down en Canvas 2D puro (sin librerías ni motores).
   ========================================================================= */

/* ---------------------------------------------------------------------- *
 *  CONFIGURACIÓN GENERAL
 * ---------------------------------------------------------------------- */

const WORLD_WIDTH = 1672;
const WORLD_HEIGHT = 941;

const PLAYER_SPEED = 230;          // píxeles por segundo

// PLAYER_SCALE y los anchors dependen del recorte real del personaje
// DENTRO de cada celda del spritesheet, no del tamaño de celda en sí.
// El spritesheet "más separada" (assets/sibille.png) usa celdas más
// grandes (más margen para evitar el sangrado entre fotogramas), pero
// el personaje ocupa una porción distinta de esa celda que en la hoja
// anterior. Estos valores se recalcularon midiendo el recuadro real
// (bounding box) del personaje en el fotograma de referencia (quieta,
// mirando al jugador: fila ROW_DOWN, columna 0) para que el tamaño en
// pantalla y el punto de apoyo sobre el suelo sean IDÉNTICOS a los de
// la hoja anterior:
//   - Alto real del personaje: hoja vieja ~210px, hoja nueva ~113.5px
//     -> factor = 210/113.5 = 1.850  ->  0.55 * 1.850 = 1.0176
//   - Con este valor, el alto dibujado en pantalla es 115.5px en
//     ambas hojas (210*0.55 = 113.5*1.0176 = 115.5).
const PLAYER_SCALE = 1.0176211453744495;
const PLAYER_COLLISION_RADIUS = 15;
const PLAYER_ANCHOR_X_FRAC = 0.4115; // centro horizontal del personaje dentro del frame
const PLAYER_ANCHOR_Y_FRAC = 0.7174; // pies del personaje dentro del frame

// PLAYER_ANCHOR_Y_FRAC se calibró sobre la fila ROW_DOWN (de frente). En las
// filas de perfil (ROW_LEFT / ROW_RIGHT) el personaje queda encuadrado unos
// píxeles más arriba dentro de la celda, así que su sombra —que se dibuja
// en this.y, el punto de apoyo calibrado para la fila de frente— queda
// ligeramente despegada de los pies al caminar de perfil. Este ajuste
// SOLO desplaza la sombra (no el sprite ni la animación) para que quede
// pegada también al caminar hacia la izquierda o la derecha.
const PLAYER_SHADOW_PROFILE_OFFSET_Y = 4;

const PICKUP_RADIUS = 46;
const BIN_RADIUS = 72;

const RECYCLE_REWARD = 10;   // puntos ganados al reciclar en el cubo correcto
const MISTAKE_PENALTY = 5;   // puntos restados al meter la basura en el cubo equivocado

// Sonido reproducido al equivocarse de cubo (junto con el "¡Idiota!" ya
// existente). Se carga una única vez y se reutiliza siempre la misma
// instancia (ver Game.constructor / checkRecycle). Archivo local en vez
// de una URL remota: evita cualquier problema de red, CORS o de
// políticas del navegador con recursos externos.
const PIG_GRUNT_SOUND_URL = 'assets/pig-grunt.mp3';

// Frases de voz de Poewee, reproducidas al azar (una por animación de
// protesta). Se cargan una única vez y se reutilizan siempre las mismas
// instancias (ver Game.constructor / Game.playRandomPoeweeVoice).
// encodeURI() evita problemas al resolver nombres de archivo con tildes.
const POEWEE_VOICE_URLS = [
  encodeURI('assets/voces/COCHINOS_REGOCHOS.mp3'),
  encodeURI('assets/voces/GORRINOS_PORQUÍSIMOS_DE_ULTRATUMBA.mp3'),
  encodeURI('assets/voces/LECHONES_DEL_AVERNO.mp3'),
  encodeURI('assets/voces/OS_MATAREMOS__SO_MARRANOS.mp3'),
  encodeURI('assets/voces/PORCINOS_DEL_INFRAMUNDO.mp3'),
];

const FRAME_DURATION = 0.085; // segundos por fotograma de animación
const SPRITE_COLUMNS = 8;
const SPRITE_ROWS = 4;

const ROW_RIGHT = 0;
const ROW_LEFT = 1;
const ROW_DOWN = 2;
const ROW_UP = 3;

const WORLD_BOUNDS = { minX: 34, maxX: WORLD_WIDTH - 34, minY: 40, maxY: WORLD_HEIGHT - 26 };

/* ---------------------------------------------------------------------- *
 *  POEWEE - configuración del NPC compañero (cerdito de peluche)
 *
 *  Igual que con Sibille, PLAYER_SCALE y los anchors dependen del recorte
 *  real del personaje DENTRO de cada celda del spritesheet. Se midió el
 *  recuadro real (bounding box) de Poewee en el fotograma de referencia
 *  (quieto, mirando al jugador: fila ROW_DOWN, columna 0) sobre el
 *  spritesheet "más separada" (assets/poewee.png, 1807x923, misma
 *  cuadrícula 8x4 que sibille.png):
 *    - Alto real del personaje en esa celda: ~99px de 231px de celda.
 *    - Se escala a ~75px de alto en pantalla (más pequeño que Sibille,
 *      ~115.5px, para que se note que es una mascota/compañero y no la
 *      protagonista) -> factor = 75 / 99 = 0.7576.
 * ---------------------------------------------------------------------- */
const POEWEE_SPEED = 105;              // píxeles por segundo (paso tranquilo, menor que el de Sibille)
const POEWEE_SCALE = 0.7576;
const POEWEE_COLLISION_RADIUS = 13;
const POEWEE_ANCHOR_X_FRAC = 0.458;    // centro horizontal del personaje dentro del frame
const POEWEE_ANCHOR_Y_FRAC = 0.687;    // pies del personaje dentro del frame

const POEWEE_TRIGGER_MIN = 120;        // distancia mínima a la que decide cambiar de sitio
const POEWEE_TRIGGER_MAX = 150;        // distancia máxima a la que decide cambiar de sitio
const POEWEE_PAUSE_MIN = 0.2;          // espera antes de echar a andar (como si "decidiera" moverse)
const POEWEE_PAUSE_MAX = 0.3;
const POEWEE_ARRIVE_THRESHOLD = 6;     // distancia a la que se considera que ha llegado
const POEWEE_TURN_SMOOTHING = 8;       // suavizado del giro al cambiar de dirección
const POEWEE_PATH_SAMPLE_STEP = 22;    // separación entre muestras al validar un destino en línea recta
const POEWEE_DEST_ATTEMPTS = 24;       // intentos para encontrar un destino válido
const POEWEE_EDGE_MARGIN = 40;         // margen respecto a los límites del escenario al elegir destino

/* ---------------------------------------------------------------------- *
 *  POEWEE - animación de protesta (idle secundario)
 *
 *  A diferencia de sibille.png/poewee.png (que reparten sus 8x4
 *  fotogramas por TODO el lienzo de 1807x923), este spritesheet
 *  (assets/poewee_enfadado.png) sólo usa una región reducida del mismo
 *  lienzo de 1807x923: los 8 fotogramas (4 columnas x 2 filas, en orden
 *  de lectura) están agrupados dentro del rectángulo aproximado
 *  x:[489,1026] y:[27,291]. POEWEE_PROTEST_REGION recoge ese rectángulo
 *  (medido sobre el fichero original, con un pequeño margen) para poder
 *  reutilizar exactamente el mismo cálculo de recorte sin sangrado que
 *  usa Animation, pero aplicado sólo a esa sub-zona en vez de al lienzo
 *  completo.
 *
 *  Igual que con POEWEE_SCALE, el factor de escala y las anclas se
 *  calcularon midiendo el recuadro real del personaje dentro de sus
 *  celdas (altura media ~90px de 132px de celda) para que, en pantalla,
 *  Poewee protestando mida lo mismo (~75px de alto) que Poewee quieto o
 *  caminando, y así no "salte" de tamaño al empezar o terminar el gesto.
 * ---------------------------------------------------------------------- */
const POEWEE_PROTEST_COLUMNS = 4;
const POEWEE_PROTEST_ROWS = 2;
const POEWEE_PROTEST_TOTAL_FRAMES = POEWEE_PROTEST_COLUMNS * POEWEE_PROTEST_ROWS;
const POEWEE_PROTEST_REGION = { x: 489, y: 27, width: 537, height: 264 };
const POEWEE_PROTEST_SCALE = 0.8324;
const POEWEE_PROTEST_ANCHOR_X_FRAC = 0.461;
const POEWEE_PROTEST_ANCHOR_Y_FRAC = 0.831;

const POEWEE_PROTEST_CHANCE = 0.35;        // probabilidad (30-40%) de protestar en cada comprobación
const POEWEE_PROTEST_CHECK_MIN = 4;        // segundos quieto antes de poder protestar
const POEWEE_PROTEST_CHECK_MAX = 8;
const POEWEE_PROTEST_DURATION_MIN = 1.5;   // duración total de la animación de protesta
const POEWEE_PROTEST_DURATION_MAX = 2.0;

/* ---------------------------------------------------------------------- *
 *  DATOS DEL ESCENARIO
 * ---------------------------------------------------------------------- */

// Lápidas y cruces, posicionadas exactamente igual que en la imagen de referencia.
const STONES_DATA = [
  { asset: 'stone1', kind: 'cross',      x: 786,  y: 154, w: 87, h: 144 }, // fila superior - cruz
  { asset: 'stone2', kind: 'tombstone',  x: 344,  y: 165, w: 90, h: 123 }, // fila superior - lápida izquierda
  { asset: 'stone3', kind: 'tombstone',  x: 1251, y: 175, w: 90, h: 123 }, // fila superior - lápida derecha
  { asset: 'stone4', kind: 'cross',      x: 1021, y: 369, w: 87, h: 144 }, // fila central - cruz
  { asset: 'stone5', kind: 'tombstone',  x: 636,  y: 380, w: 90, h: 123 }, // fila central - lápida
  { asset: 'stone6', kind: 'tombstone',  x: 291,  y: 521, w: 90, h: 123 }, // fila inferior - lápida izquierda
  { asset: 'stone7', kind: 'tombstone',  x: 1278, y: 521, w: 90, h: 123 }, // fila inferior - lápida derecha
];

// Cubos de reciclaje, abajo a la izquierda, igual que en la referencia.
const BINS_DATA = [
  { id: 'amarillo', asset: 'cuboAmarillo', x: 372, y: 787, w: 73, h: 109, accepts: 'lata' },
  { id: 'azul',      asset: 'cuboAzul',     x: 452, y: 787, w: 76, h: 110, accepts: 'periodico' },
  { id: 'gris',      asset: 'cuboGris',     x: 532, y: 787, w: 79, h: 112, accepts: 'manzana' },
];

// Basura repartida por el escenario. Nunca sobre una lápida.
const ITEMS_DATA = [
  { type: 'lata',      asset: 'basuraLata',      x: 1100, y: 322 },
  { type: 'periodico', asset: 'basuraPeriodico', x: 557,  y: 242 },
  { type: 'manzana',   asset: 'basuraManzana',   x: 555,  y: 585 },
  { type: 'lata',      asset: 'basuraLata',      x: 1470, y: 240 },
  { type: 'periodico', asset: 'basuraPeriodico', x: 870,  y: 450 },
  { type: 'manzana',   asset: 'basuraManzana',   x: 1500, y: 480 },
  { type: 'lata',      asset: 'basuraLata',      x: 220,  y: 400 },
  { type: 'periodico', asset: 'basuraPeriodico', x: 1150, y: 700 },
  { type: 'manzana',   asset: 'basuraManzana',   x: 1050, y: 860 },
];

const ASSET_LIST = {
  background:      'assets/base.png',
  sibille:         'assets/sibille.png',
  poewee:          'assets/poewee.png',
  poeweeProtest:   'assets/poewee_enfadado.png',
  stone1:          'assets/stone_1.png',
  stone2:          'assets/stone_2.png',
  stone3:          'assets/stone_2.png',
  stone4:          'assets/stone_1.png',
  stone5:          'assets/stone_2.png',
  stone6:          'assets/stone_2.png',
  stone7:          'assets/stone_2.png',
  cuboAmarillo:    'assets/cubo_amarillo.png',
  cuboAzul:        'assets/cubo_azul.png',
  cuboGris:        'assets/cubo_gris.png',
  basuraLata:      'assets/basura_amarillo.png',
  basuraPeriodico: 'assets/basura_azul.png',
  basuraManzana:   'assets/basura_gris.png',
};

/* ---------------------------------------------------------------------- *
 *  AssetLoader - precarga todas las imágenes antes de permitir jugar
 * ---------------------------------------------------------------------- */

class AssetLoader {
  constructor(manifest) {
    this.manifest = manifest;
    this.images = {};
    this.total = Object.keys(manifest).length;
    this.loaded = 0;
  }

  load(onProgress) {
    const promises = Object.entries(this.manifest).map(([key, path]) => {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          this.images[key] = img;
          this.loaded++;
          if (onProgress) onProgress(this.loaded, this.total);
          resolve(img);
        };
        img.onerror = () => {
          console.error('No se pudo cargar el recurso:', path);
          this.loaded++;
          if (onProgress) onProgress(this.loaded, this.total);
          resolve(null);
        };
        img.src = path;
      });
    });
    return Promise.all(promises).then(() => this.images);
  }

  get(key) {
    return this.images[key];
  }
}

/* ---------------------------------------------------------------------- *
 *  Sprite - envoltorio simple para imágenes estáticas
 * ---------------------------------------------------------------------- */

class Sprite {
  constructor(image, x, y, w, h) {
    this.image = image;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }

  draw(ctx) {
    if (!this.image) return;
    ctx.imageSmoothingEnabled=false;
    ctx.drawImage(this.image, this.x, this.y, this.w, this.h);
  }
}

/* ---------------------------------------------------------------------- *
 *  Animation - controla la hoja de sprites de Sibille (8 columnas x 4 filas)
 * ---------------------------------------------------------------------- */

class Animation {
  constructor(image, columns, rows, region) {
    this.image = image;
    this.columns = columns;
    this.rows = rows;

    // region permite recortar sólo una sub-zona del lienzo en vez de
    // usar la imagen completa (necesario para spritesheets como
    // poewee_enfadado.png, cuyos fotogramas no ocupan todo el archivo).
    // Por defecto se usa la imagen entera, igual que antes.
    const regionX = region ? region.x : 0;
    const regionY = region ? region.y : 0;
    const regionW = region ? region.width : image.width;
    const regionH = region ? region.height : image.height;

    // CAUSA RAÍZ DEL SANGRADO ENTRE FOTOGRAMAS (histórico): con la hoja
    // de sprites original, el ancho de fotograma (image.width / columnas)
    // salía FRACCIONARIO. Al usar ese valor directamente como sx/sw de
    // drawImage(), cada corte caía en un límite de píxel no entero y,
    // con el suavizado de imagen activo, el canvas interpolaba/mezclaba
    // en ese borde los píxeles del fotograma vecino, colando fragmentos
    // de brazos/piernas de otro frame.
    //
    // El cálculo de abajo es GENÉRICO y no depende del tamaño concreto
    // del archivo ni de si se recorta la imagen completa o sólo una
    // región de ella: precalcula los límites de cada columna/fila
    // redondeando de forma acumulativa (no multiplicando un ancho medio
    // fraccionario), de modo que los cortes sean siempre números enteros
    // y cubran exactamente la región indicada sin huecos ni solapes.
    this.colBounds = [];
    for (let c = 0; c <= columns; c++) {
      this.colBounds.push(regionX + Math.round((c * regionW) / columns));
    }
    this.rowBounds = [];
    for (let r = 0; r <= rows; r++) {
      this.rowBounds.push(regionY + Math.round((r * regionH) / rows));
    }

    // Tamaño nominal de fotograma (usado sólo para escalar el dibujo;
    // todas las celdas miden 1px como mucho de diferencia entre sí).
    this.frameW = this.colBounds[1] - this.colBounds[0];
    this.frameH = this.rowBounds[1] - this.rowBounds[0];

    this.currentRow = ROW_DOWN;
    this.currentFrame = 0;
    this.timer = 0;
  }

  update(dt, isMoving, row) {
    this.currentRow = row;
    if (!isMoving) {
      // Al detenerse, se queda quieta mirando hacia la última dirección.
      this.currentFrame = 0;
      this.timer = 0;
      return;
    }
    this.timer += dt;
    if (this.timer >= FRAME_DURATION) {
      this.timer -= FRAME_DURATION;
      this.currentFrame = (this.currentFrame + 1) % this.columns;
    }
  }

  draw(ctx, drawX, drawY, drawW, drawH) {
    const sx = this.colBounds[this.currentFrame];
    const sy = this.rowBounds[this.currentRow];
    const sw = this.colBounds[this.currentFrame + 1] - sx;
    const sh = this.rowBounds[this.currentRow + 1] - sy;
    ctx.drawImage(
      this.image,
      sx, sy, sw, sh,
      drawX, drawY, drawW, drawH
    );
  }
}

/* ---------------------------------------------------------------------- *
 *  Collision - utilidades estáticas de colisión
 * ---------------------------------------------------------------------- */

// Comparador reutilizado por Game.render() para el ordenado por profundidad.
// Declararlo una sola vez fuera de la clase evita crear una función nueva
// en cada frame sólo para pasársela a Array.prototype.sort().
function sortByDepth(a, b) {
  return a.sortY - b.sortY;
}

class Collision {
  // Colisión círculo (jugador) contra rectángulo (base de un obstáculo)
  static circleRect(cx, cy, radius, rect) {
    const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
    const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx * dx + dy * dy) < (radius * radius);
  }

  static distance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Punto libre: dentro de los límites del escenario (con margen para el
  // radio del personaje) y sin solaparse con ningún obstáculo.
  static isPointFree(x, y, radius, obstacles) {
    if (x < WORLD_BOUNDS.minX + radius || x > WORLD_BOUNDS.maxX - radius) return false;
    if (y < WORLD_BOUNDS.minY + radius || y > WORLD_BOUNDS.maxY - radius) return false;
    for (let i = 0; i < obstacles.length; i++) {
      if (obstacles[i].collidesWithCircle(x, y, radius)) return false;
    }
    return true;
  }

  // Ruta libre: muestrea el segmento recto entre dos puntos a intervalos
  // regulares y comprueba que ningún punto intermedio cae sobre un
  // obstáculo. No es un pathfinding completo, pero con un escenario de
  // obstáculos dispersos como este basta para descartar destinos que
  // obligarían a atravesar una lápida o un cubo en línea recta.
  static isPathClear(x0, y0, x1, y1, radius, obstacles, sampleStep) {
    const dist = Collision.distance(x0, y0, x1, y1);
    const steps = Math.max(1, Math.ceil(dist / sampleStep));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (!Collision.isPointFree(x, y, radius, obstacles)) return false;
    }
    return true;
  }
}

/* ---------------------------------------------------------------------- *
 *  Sombras - puramente visuales (dan sensación de volumen). No
 *  participan en colisiones ni en la lógica del juego: cada objeto las
 *  dibuja como el PRIMER paso de su propio draw(ctx), justo antes de su
 *  sprite, así quedan automáticamente por debajo de él y respetan el
 *  ordenado por profundidad (sortY) que ya existe, sin tocarlo.
 * ---------------------------------------------------------------------- */
const SHADOW_COLOR = 'rgba(0, 0, 0, 0.25)'; // negro, ~25% de opacidad (dentro del 20-30% pedido)
const SHADOW_BLUR = 'blur(2px)';            // desenfoque ligero
const SHADOW_OFFSET_X = 4;                  // pocos píxeles a la derecha...
const SHADOW_OFFSET_Y = 3;                  // ...y hacia abajo (luz simulada arriba-izquierda)
const SHADOW_STRETCH_AMOUNT = 0.07;         // 7%: compresión/estiramiento al caminar (5-10% pedido)

// Sintonía específica para Sibille y Poewee: una sombra "proyectada justo
// debajo del personaje" tiene que quedar más pegada y contenida que la de
// un objeto grande y estático como una lápida, o da sensación de que el
// personaje flota. Por eso usa menos desplazamiento (casi pegada a los
// pies), un tamaño algo menor y un desenfoque un punto mayor.
const CHARACTER_SHADOW_OFFSET_X = 2;
const CHARACTER_SHADOW_OFFSET_Y = 2;
const CHARACTER_SHADOW_BLUR = 'blur(3px)';
const CHARACTER_SHADOW_RADIUS_FACTOR = 1.0; // antes 1.3: elipse más pequeña

// Elipse de sombra genérica, reutilizada por lápidas, cruces, cubos y
// personajes. offsetX/offsetY/blur son opcionales: si no se indican, se
// usan los valores por defecto de arriba (así lápidas/cruces/cubos no
// cambian nada).
function drawShadow(ctx, cx, cy, rx, ry, offsetX = SHADOW_OFFSET_X, offsetY = SHADOW_OFFSET_Y, blur = SHADOW_BLUR) {
  ctx.save();
  ctx.filter = blur;
  ctx.fillStyle = SHADOW_COLOR;
  ctx.beginPath();
  ctx.ellipse(cx + offsetX, cy + offsetY, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Variante para Sibille y Poewee: reutiliza su propio radio de colisión
// (ya definido y ajustado para el juego) como base del tamaño de la
// sombra, así queda pegada a los pies sin inventar constantes nuevas de
// tamaño por personaje. El centro de la elipse es (cx, cy), que quien
// llama siempre pasa como (this.x, this.y): el mismo punto de apoyo en
// el suelo que ya usan como ancla de pies y como sortY para el ordenado
// por profundidad. Si está caminando, lee el fotograma actual de su
// animación (currentFrame/timer, sin modificarlos) para comprimir y
// estirar la elipse muy ligeramente en sincronía con el ciclo de paso;
// quieto, se queda siempre con su forma normal.
function drawCharacterShadow(ctx, cx, cy, baseRadius, isMoving, animation) {
  const rx = baseRadius * CHARACTER_SHADOW_RADIUS_FACTOR;
  const ry = rx * 0.38;

  if (!isMoving) {
    drawShadow(ctx, cx, cy, rx, ry, CHARACTER_SHADOW_OFFSET_X, CHARACTER_SHADOW_OFFSET_Y, CHARACTER_SHADOW_BLUR);
    return;
  }

  const phase = (animation.currentFrame + animation.timer / FRAME_DURATION) / animation.columns;
  const wave = Math.sin(phase * Math.PI * 2) * SHADOW_STRETCH_AMOUNT;
  drawShadow(
    ctx, cx, cy,
    rx * (1 + wave), ry * (1 - wave),
    CHARACTER_SHADOW_OFFSET_X, CHARACTER_SHADOW_OFFSET_Y, CHARACTER_SHADOW_BLUR
  );
}

/* ---------------------------------------------------------------------- *
 *  Obstacle - lápidas, cruces y cubos. Sólo la BASE bloquea el paso,
 *  permitiendo que Sibille quede tapada visualmente por la parte alta.
 * ---------------------------------------------------------------------- */

class Obstacle {
  constructor(image, x, y, w, h, baseWidthFrac, baseHeightFrac) {
    this.image = image;
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;

    // Rectángulo de colisión: sólo la base/plinto del objeto.
    const bw = w * baseWidthFrac;
    const bh = h * baseHeightFrac;
    this.collisionRect = {
      x: x + (w - bw) / 2,
      y: y + (h - bh),
      w: bw,
      h: bh,
    };

    // Punto usado para el ordenado por profundidad (Y de los pies del objeto).
    this.sortY = y + h;
  }

  collidesWithCircle(cx, cy, radius) {
    return Collision.circleRect(cx, cy, radius, this.collisionRect);
  }

  draw(ctx) {
    if (!this.image) return;

    // Sombra apoyada sobre la misma base (collisionRect) que ya se usa
    // para las colisiones, así el tamaño se ajusta solo a cada lápida,
    // cruz o cubo sin necesidad de nuevas constantes por objeto.
    const rx = this.collisionRect.w * 0.55;
    const ry = this.collisionRect.h * 0.32;
    const cx = this.collisionRect.x + this.collisionRect.w / 2;
    const cy = this.collisionRect.y + this.collisionRect.h * 0.85;
    drawShadow(ctx, cx, cy, rx, ry);

    ctx.drawImage(this.image, this.x, this.y, this.w, this.h);
  }
}

/* ---------------------------------------------------------------------- *
 *  Bin - cubo de reciclaje (amarillo / azul / gris)
 * ---------------------------------------------------------------------- */

class Bin extends Obstacle {
  constructor(image, data) {
    // Los cubos bloquean sobre toda su base (algo más alta que las lápidas
    // proporcionalmente, ya que son objetos pequeños y compactos).
    super(image, data.x, data.y, data.w, data.h, 0.72, 0.55);
    this.id = data.id;
    this.accepts = data.accepts;
    this.centerX = data.x + data.w / 2;
    this.centerY = data.y + data.h * 0.6;
  }
}

/* ---------------------------------------------------------------------- *
 *  Item - objetos de basura recogibles (lata, periódico, manzana mordida)
 * ---------------------------------------------------------------------- */

class Item {
  constructor(image, data) {
    this.image = image;
    this.type = data.type;
    this.x = data.x;
    this.y = data.y;
    this.w = image ? image.width : 40;
    this.h = image ? image.height : 40;
    this.collected = false;
    this.sortY = this.y + this.h / 2;
  }

  draw(ctx) {
    if (this.collected || !this.image) return;
    ctx.drawImage(
      this.image,
      this.x - this.w / 2,
      this.y - this.h / 2,
      this.w,
      this.h
    );
  }
}

/* ---------------------------------------------------------------------- *
 *  RecycleEffect - pequeña animación al reciclar correctamente
 * ---------------------------------------------------------------------- */

class RecycleEffect {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.age = 0;
    this.duration = 0.7;
    this.particles = [];
    const count = 10;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      this.particles.push({
        angle,
        speed: 60 + Math.random() * 40,
      });
    }
  }

  get finished() {
    return this.age >= this.duration;
  }

  update(dt) {
    this.age += dt;
  }

  draw(ctx) {
    const t = this.age / this.duration;
    const alpha = Math.max(0, 1 - t);

    ctx.save();
    ctx.globalAlpha = alpha;

    // Partículas en expansión
    for (const p of this.particles) {
      const dist = p.speed * this.age;
      const px = this.x + Math.cos(p.angle) * dist;
      const py = this.y + Math.sin(p.angle) * dist - dist * 0.3;
      ctx.fillStyle = '#e8dca0';
      ctx.beginPath();
      ctx.arc(px, py, 3.2 * (1 - t), 0, Math.PI * 2);
      ctx.fill();
    }

    // Texto flotante "+10"
    ctx.font = 'bold 22px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff6d9';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    const floatY = this.y - 20 - t * 34;
    ctx.strokeText(`+${RECYCLE_REWARD}`, this.x, floatY);
    ctx.fillText(`+${RECYCLE_REWARD}`, this.x, floatY);

    ctx.restore();
  }
}

/* ---------------------------------------------------------------------- *
 *  MistakeEffect - pequeña animación al tirar la basura en el cubo
 *  equivocado. Deliberadamente opuesta a RecycleEffect: partículas
 *  oscuras cayendo (en vez de partículas doradas ascendiendo) y texto
 *  en rojo, para que se lea de un vistazo como un error y no como un
 *  acierto.
 * ---------------------------------------------------------------------- */

class MistakeEffect {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.age = 0;
    this.duration = 1.0;
    this.particles = [];
    const count = 8;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      this.particles.push({
        angle,
        speed: 40 + Math.random() * 30,
      });
    }
  }

  get finished() {
    return this.age >= this.duration;
  }

  update(dt) {
    this.age += dt;
  }

  draw(ctx) {
    const t = this.age / this.duration;
    const alpha = Math.max(0, 1 - t);

    ctx.save();
    ctx.globalAlpha = alpha;

    // Partículas cayendo (gravedad positiva en vez de ascender).
    for (const p of this.particles) {
      const dist = p.speed * this.age;
      const px = this.x + Math.cos(p.angle) * dist * 0.6;
      const py = this.y + Math.sin(p.angle) * dist * 0.3 + dist * 0.6;
      ctx.fillStyle = '#8a2f2f';
      ctx.beginPath();
      ctx.arc(px, py, 2.8 * (1 - t), 0, Math.PI * 2);
      ctx.fill();
    }

    const floatY = this.y - 20 - t * 34;

    // Mensaje burlón "¡Idiota!": entra grande de golpe (efecto de
    // "impacto") y se asienta enseguida a su tamaño normal, para que se
    // lea como una pulla cómica y no como un simple contador de puntos.
    const punch = 1 + Math.max(0, 0.5 - t * 3.5); // sólo afecta a los primeros ~0.15s
    ctx.save();
    ctx.translate(this.x, floatY - 20);
    ctx.scale(punch, punch);
    ctx.font = 'bold 24px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff6b6b';
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.lineWidth = 3.5;
    ctx.strokeText('¡Idiota!', 0, 0);
    ctx.fillText('¡Idiota!', 0, 0);
    ctx.restore();

    // Texto flotante "-5"
    ctx.font = 'bold 22px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff6b6b';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 3;
    ctx.strokeText(`-${MISTAKE_PENALTY}`, this.x, floatY);
    ctx.fillText(`-${MISTAKE_PENALTY}`, this.x, floatY);

    ctx.restore();
  }
}

/* ---------------------------------------------------------------------- *
 *  Player - Sibille
 * ---------------------------------------------------------------------- */

class Player {
  constructor(animation, x, y) {
    this.animation = animation;
    this.x = x;
    this.y = y;
    this.speed = PLAYER_SPEED;
    this.carrying = null; // { type, image }
    this.moving = false;
    this.facingRow = ROW_DOWN;
    this.sortY = 0;

    // Id del cubo equivocado en el que está apoyada Sibille ahora mismo
    // (o null si no está sobre ninguno). Sirve para penalizar una única
    // vez por acercamiento en vez de en cada fotograma mientras siga
    // dentro del radio del mismo cubo incorrecto.
    this.wrongBinId = null;
  }

  tryMove(dx, dy, obstacles, dt) {
    this.moving = (dx !== 0 || dy !== 0);

    if (dx !== 0 && dy !== 0) {
      const inv = 1 / Math.sqrt(2);
      dx *= inv;
      dy *= inv;
    }

    const stepX = dx * this.speed * dt;
    const stepY = dy * this.speed * dt;

    // Movimiento separado por ejes para permitir deslizarse junto a obstáculos.
    let newX = this.x + stepX;
    if (!this.collidesAt(newX, this.y, obstacles)) {
      this.x = newX;
    }

    let newY = this.y + stepY;
    if (!this.collidesAt(this.x, newY, obstacles)) {
      this.y = newY;
    }

    // Límites del escenario.
    this.x = Math.min(WORLD_BOUNDS.maxX, Math.max(WORLD_BOUNDS.minX, this.x));
    this.y = Math.min(WORLD_BOUNDS.maxY, Math.max(WORLD_BOUNDS.minY, this.y));

    // Dirección de la animación según el eje dominante del movimiento.
    if (this.moving) {
      if (Math.abs(dx) >= Math.abs(dy)) {
        this.facingRow = dx >= 0 ? ROW_RIGHT : ROW_LEFT;
      } else {
        this.facingRow = dy >= 0 ? ROW_DOWN : ROW_UP;
      }
    }

    this.sortY = this.y;
  }

  collidesAt(x, y, obstacles) {
    for (const obstacle of obstacles) {
      if (obstacle.collidesWithCircle(x, y, PLAYER_COLLISION_RADIUS)) {
        return true;
      }
    }
    return false;
  }

  updateAnimation(dt) {
    this.animation.update(dt, this.moving, this.facingRow);
  }

  get drawW() {
    return this.animation.frameW * PLAYER_SCALE;
  }

  get drawH() {
    return this.animation.frameH * PLAYER_SCALE;
  }

  draw(ctx) {
    const drawW = this.drawW;
    const drawH = this.drawH;
    const drawX = this.x - drawW * PLAYER_ANCHOR_X_FRAC;
    const drawY = this.y - drawH * PLAYER_ANCHOR_Y_FRAC;

    // Solo se ajusta el punto donde se dibuja la sombra (no this.x/this.y,
    // que siguen intactos para colisiones, orden de dibujo, etc.).
    const shadowCy = this.y + (
      (this.facingRow === ROW_LEFT || this.facingRow === ROW_RIGHT)
        ? PLAYER_SHADOW_PROFILE_OFFSET_Y
        : 0
    );

    drawCharacterShadow(ctx, this.x, shadowCy, PLAYER_COLLISION_RADIUS, this.moving, this.animation);

    this.animation.draw(ctx, drawX, drawY, drawW, drawH);

    // Icono del objeto que lleva encima de la cabeza.
    if (this.carrying && this.carrying.image) {
      const iconSize = 28;
      const iconX = this.x - iconSize / 2;
      const iconY = drawY - iconSize - 6;

      ctx.save();
      ctx.fillStyle = 'rgba(20, 18, 12, 0.55)';
      ctx.beginPath();
      ctx.ellipse(this.x, iconY + iconSize / 2, iconSize / 2 + 5, iconSize / 2 + 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(230, 220, 180, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.drawImage(this.carrying.image, iconX, iconY, iconSize, iconSize);
      ctx.restore();
    }
  }
}

/* ---------------------------------------------------------------------- *
 *  Poewee - NPC compañero (cerdito de peluche). No es jugable: se mueve
 *  de forma autónoma por el cementerio con una pequeña máquina de
 *  estados, sin timers ni listeners propios: todo se actualiza desde
 *  Game.update() dentro del mismo bucle principal.
 *
 *  Estados:
 *    'idle'       -> quieto, vigilando la distancia a Sibille (y, de vez
 *                    en cuando, con ganas de protestar).
 *    'protesting' -> quieto en el sitio haciendo el gesto de protesta;
 *                    se interrumpe al instante si Sibille se acerca.
 *    'deciding'   -> ha decidido moverse; espera 200-300ms antes de andar
 *                    (como si se levantara con calma, no por miedo).
 *    'walking'    -> caminando hacia un destino aleatorio válido.
 * ---------------------------------------------------------------------- */

class Poewee {
  constructor(walkAnimation, protestAnimation, x, y, onProtestStart) {
    this.walkAnimation = walkAnimation;
    this.protestAnimation = protestAnimation;
    this.x = x;
    this.y = y;
    this.speed = POEWEE_SPEED;

    // Se llama (si se indica) justo en el instante en que empieza cada
    // animación de protesta, para que quien gestione el juego pueda
    // reproducir en ese mismo momento la frase de voz correspondiente.
    // Puramente un aviso hacia fuera: Poewee no sabe nada de audio.
    this.onProtestStart = onProtestStart || null;

    // Estados: 'idle' (quieto, vigilando), 'protesting' (haciendo el
    // gesto de protesta), 'deciding' (ha decidido moverse, pausa breve
    // antes de andar) y 'walking' (caminando hacia un destino).
    this.state = 'idle';
    this.pauseTimer = 0;
    this.destX = x;
    this.destY = y;

    // Velocidad suavizada: se interpola hacia la dirección deseada en
    // lugar de aplicarla de golpe, para que los giros al esquivar
    // obstáculos se vean naturales y no bruscos.
    this.velX = 0;
    this.velY = 0;

    this.moving = false;
    this.facingRow = ROW_DOWN;
    this.sortY = y;

    // Distancia de activación ligeramente distinta cada vez que se elige
    // (dentro del rango pedido) para que el comportamiento no se sienta
    // mecánico ni disparado siempre en el mismo punto exacto.
    this.triggerDistance = POEWEE_TRIGGER_MIN + Math.random() * (POEWEE_TRIGGER_MAX - POEWEE_TRIGGER_MIN);

    // Idle secundario (protesta): mientras está 'idle' acumula tiempo
    // quieto; al superar nextProtestCheck se hace una tirada y, si sale
    // bien, se pasa a 'protesting'. Si no, se programa la siguiente
    // comprobación más adelante, así el gesto se siente espontáneo y no
    // repetitivo.
    this.idleTimer = 0;
    this.nextProtestCheck = POEWEE_PROTEST_CHECK_MIN + Math.random() * (POEWEE_PROTEST_CHECK_MAX - POEWEE_PROTEST_CHECK_MIN);
    this.protestElapsed = 0;
    this.protestDuration = 0;
    this.protestFrameDuration = 0;
    this.protestFrameIndex = 0;
  }

  // Elige un punto aleatorio dentro de la zona jugable que esté libre de
  // obstáculos y alcanzable en línea recta desde la posición actual. Si
  // tras varios intentos no encuentra ninguno con ruta despejada, se
  // conforma con un punto simplemente libre (sin obstáculo encima), y en
  // último caso se queda donde está.
  pickDestination(obstacles) {
    let fallback = null;

    for (let attempt = 0; attempt < POEWEE_DEST_ATTEMPTS; attempt++) {
      const x = WORLD_BOUNDS.minX + POEWEE_EDGE_MARGIN +
        Math.random() * (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX - POEWEE_EDGE_MARGIN * 2);
      const y = WORLD_BOUNDS.minY + POEWEE_EDGE_MARGIN +
        Math.random() * (WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY - POEWEE_EDGE_MARGIN * 2);

      if (!Collision.isPointFree(x, y, POEWEE_COLLISION_RADIUS, obstacles)) continue;

      if (Collision.isPathClear(this.x, this.y, x, y, POEWEE_COLLISION_RADIUS, obstacles, POEWEE_PATH_SAMPLE_STEP)) {
        return { x, y };
      }
      if (!fallback) fallback = { x, y };
    }

    return fallback || { x: this.x, y: this.y };
  }

  // Movimiento igual que Player.tryMove: paso separado por ejes para
  // poder deslizarse junto a los obstáculos en vez de quedarse clavado.
  collidesAt(x, y, obstacles) {
    for (const obstacle of obstacles) {
      if (obstacle.collidesWithCircle(x, y, POEWEE_COLLISION_RADIUS)) {
        return true;
      }
    }
    return false;
  }

  update(dt, player, obstacles) {
    // Igual que Player.tryMove() recalcula this.sortY = this.y en cada
    // frame sin condición (se mueva o no), aquí se hace lo mismo antes de
    // cualquier rama de estado: así Poewee siempre entra en el ordenado
    // por profundidad (sortByDepth, en render()) con su posición actual,
    // exactamente igual que Sibille, en vez de quedarse con un valor que
    // sólo se refrescaba mientras estaba en el estado 'walking'.
    this.sortY = this.y;

    if (this.state === 'idle') {
      this.moving = false;
      const d = Collision.distance(this.x, this.y, player.x, player.y);
      if (d < this.triggerDistance) {
        this.state = 'deciding';
        this.pauseTimer = POEWEE_PAUSE_MIN + Math.random() * (POEWEE_PAUSE_MAX - POEWEE_PAUSE_MIN);
        return;
      }

      // Lleva un rato quieto: de vez en cuando comprueba si le apetece
      // protestar. No ocurre cada vez que se para, y si la tirada falla
      // simplemente se reprograma la siguiente comprobación más tarde.
      this.idleTimer += dt;
      if (this.idleTimer >= this.nextProtestCheck) {
        this.idleTimer = 0;
        this.nextProtestCheck = POEWEE_PROTEST_CHECK_MIN + Math.random() * (POEWEE_PROTEST_CHECK_MAX - POEWEE_PROTEST_CHECK_MIN);

        if (Math.random() < POEWEE_PROTEST_CHANCE) {
          this.state = 'protesting';
          this.protestElapsed = 0;
          this.protestFrameIndex = 0;
          this.protestDuration = POEWEE_PROTEST_DURATION_MIN + Math.random() * (POEWEE_PROTEST_DURATION_MAX - POEWEE_PROTEST_DURATION_MIN);
          this.protestFrameDuration = this.protestDuration / POEWEE_PROTEST_TOTAL_FRAMES;
          if (this.onProtestStart) this.onProtestStart();
        }
      }
      return;
    }

    if (this.state === 'protesting') {
      this.moving = false;

      // La lógica de movimiento tiene siempre prioridad: si Sibille se
      // acerca a mitad de la protesta, se corta el gesto en el acto y se
      // pasa directamente a caminar (sin la pausa de 'deciding'; ya
      // estaba parado, así que no hace falta simular que "se decide").
      const d = Collision.distance(this.x, this.y, player.x, player.y);
      if (d < this.triggerDistance) {
        const dest = this.pickDestination(obstacles);
        this.destX = dest.x;
        this.destY = dest.y;
        this.state = 'walking';
        return;
      }

      this.protestElapsed += dt;
      this.protestFrameIndex = Math.min(
        POEWEE_PROTEST_TOTAL_FRAMES - 1,
        Math.floor(this.protestElapsed / this.protestFrameDuration)
      );

      if (this.protestElapsed >= this.protestDuration) {
        // Termina el gesto: vuelve a su postura de reposo mirando de
        // frente y reinicia el contador para la próxima comprobación.
        this.state = 'idle';
        this.facingRow = ROW_DOWN;
        this.idleTimer = 0;
        this.nextProtestCheck = POEWEE_PROTEST_CHECK_MIN + Math.random() * (POEWEE_PROTEST_CHECK_MAX - POEWEE_PROTEST_CHECK_MIN);
      }
      return;
    }

    if (this.state === 'deciding') {
      this.moving = false;
      this.pauseTimer -= dt;
      if (this.pauseTimer <= 0) {
        const dest = this.pickDestination(obstacles);
        this.destX = dest.x;
        this.destY = dest.y;
        this.state = 'walking';
      }
      return;
    }

    // this.state === 'walking'
    const dx = this.destX - this.x;
    const dy = this.destY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < POEWEE_ARRIVE_THRESHOLD) {
      this.moving = false;
      this.velX = 0;
      this.velY = 0;
      // Nueva distancia de activación para la próxima vez, así el
      // comportamiento sigue sintiéndose variado partida tras partida.
      this.triggerDistance = POEWEE_TRIGGER_MIN + Math.random() * (POEWEE_TRIGGER_MAX - POEWEE_TRIGGER_MIN);
      this.idleTimer = 0;
      this.nextProtestCheck = POEWEE_PROTEST_CHECK_MIN + Math.random() * (POEWEE_PROTEST_CHECK_MAX - POEWEE_PROTEST_CHECK_MIN);
      this.state = 'idle';
      return;
    }

    const dirX = dx / dist;
    const dirY = dy / dist;
    const targetVelX = dirX * this.speed;
    const targetVelY = dirY * this.speed;

    // Suavizado exponencial: la velocidad actual persigue a la deseada
    // en vez de saltar a ella, dando giros suaves al rodear obstáculos.
    const smooth = Math.min(1, dt * POEWEE_TURN_SMOOTHING);
    this.velX += (targetVelX - this.velX) * smooth;
    this.velY += (targetVelY - this.velY) * smooth;

    const stepX = this.velX * dt;
    const stepY = this.velY * dt;

    const newX = this.x + stepX;
    if (!this.collidesAt(newX, this.y, obstacles)) {
      this.x = newX;
    } else {
      this.velX = 0;
    }

    const newY = this.y + stepY;
    if (!this.collidesAt(this.x, newY, obstacles)) {
      this.y = newY;
    } else {
      this.velY = 0;
    }

    this.x = Math.min(WORLD_BOUNDS.maxX, Math.max(WORLD_BOUNDS.minX, this.x));
    this.y = Math.min(WORLD_BOUNDS.maxY, Math.max(WORLD_BOUNDS.minY, this.y));

    this.moving = (Math.abs(this.velX) > 1 || Math.abs(this.velY) > 1);
    if (this.moving) {
      if (Math.abs(this.velX) >= Math.abs(this.velY)) {
        this.facingRow = this.velX >= 0 ? ROW_RIGHT : ROW_LEFT;
      } else {
        this.facingRow = this.velY >= 0 ? ROW_DOWN : ROW_UP;
      }
    }
  }

  updateAnimation(dt) {
    if (this.state === 'protesting') {
      // El avance de fotogramas (basado en protestElapsed) ya se calcula
      // en update(); aquí sólo se traduce el índice de fotograma actual
      // al recorte (columna, fila) que le corresponde en la hoja de
      // protesta, sin tocar walkAnimation para que conserve su último
      // fotograma de reposo intacto.
      const col = this.protestFrameIndex % POEWEE_PROTEST_COLUMNS;
      const row = Math.floor(this.protestFrameIndex / POEWEE_PROTEST_COLUMNS);
      this.protestAnimation.currentFrame = col;
      this.protestAnimation.currentRow = row;
      return;
    }
    this.walkAnimation.update(dt, this.moving, this.facingRow);
  }

  get drawW() {
    return this.walkAnimation.frameW * POEWEE_SCALE;
  }

  get drawH() {
    return this.walkAnimation.frameH * POEWEE_SCALE;
  }

  draw(ctx) {
    drawCharacterShadow(ctx, this.x, this.y, POEWEE_COLLISION_RADIUS, this.moving, this.walkAnimation);

    if (this.state === 'protesting') {
      const drawW = this.protestAnimation.frameW * POEWEE_PROTEST_SCALE;
      const drawH = this.protestAnimation.frameH * POEWEE_PROTEST_SCALE;
      const drawX = this.x - drawW * POEWEE_PROTEST_ANCHOR_X_FRAC;
      const drawY = this.y - drawH * POEWEE_PROTEST_ANCHOR_Y_FRAC;
      this.protestAnimation.draw(ctx, drawX, drawY, drawW, drawH);
      return;
    }

    if (!this.moving) {
      // Postura de reposo: el fotograma frontal del spritesheet de
      // protesta (columna 0, fila 0) -- Poewee de frente, brazos
      // relajados y ligeramente separados del cuerpo, justo antes de
      // empezar a protestar. Es el mismo fotograma con el que arranca
      // la animación de protesta y al que se vuelve al terminarla, así
      // que la transición entre "quieto" <-> "protestando" es idéntica
      // en ambos sentidos.
      this.protestAnimation.currentFrame = 0;
      this.protestAnimation.currentRow = 0;
      const drawW = this.protestAnimation.frameW * POEWEE_PROTEST_SCALE;
      const drawH = this.protestAnimation.frameH * POEWEE_PROTEST_SCALE;
      const drawX = this.x - drawW * POEWEE_PROTEST_ANCHOR_X_FRAC;
      const drawY = this.y - drawH * POEWEE_PROTEST_ANCHOR_Y_FRAC;
      this.protestAnimation.draw(ctx, drawX, drawY, drawW, drawH);
      return;
    }

    const drawW = this.drawW;
    const drawH = this.drawH;
    const drawX = this.x - drawW * POEWEE_ANCHOR_X_FRAC;
    const drawY = this.y - drawH * POEWEE_ANCHOR_Y_FRAC;
    this.walkAnimation.draw(ctx, drawX, drawY, drawW, drawH);
  }
}

/* ---------------------------------------------------------------------- *
 *  Game - clase principal, orquesta el bucle, input y render
 * ---------------------------------------------------------------------- */

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    // Desactivado UNA sola vez para todo el contexto: evita que el
    // navegador interpole/mezcle píxeles en los bordes de cada recorte de
    // drawImage() (la causa real del sangrado entre fotogramas de Sibille)
    // y mantiene el arte pixel-art nítido en todo el juego.
    this.ctx.imageSmoothingEnabled = false;
    this.assets = new AssetLoader(ASSET_LIST);

    // Se crea una única vez y se reutiliza siempre la misma instancia
    // (ver checkRecycle): no se crea un Audio nuevo en cada error.
    this.pigGruntSound = new Audio(PIG_GRUNT_SOUND_URL);
    this.pigGruntSound.preload = 'auto';
    this.pigGruntSound.addEventListener('error', () => {
      console.error(
        'No se pudo cargar el sonido del gruñido del cerdo. Código de error:',
        this.pigGruntSound.error && this.pigGruntSound.error.code
      );
    });
    this.pigGruntSound.load();

    // Frases de voz de Poewee: se cargan una única vez y se reutilizan
    // siempre las mismas cinco instancias de Audio (nunca se crean
    // instancias nuevas al hablar). lastPoeweeVoiceIndex recuerda cuál
    // sonó la última vez para poder excluirla del siguiente sorteo.
    this.poeweeVoices = POEWEE_VOICE_URLS.map((url) => {
      const audio = new Audio(url);
      audio.preload = 'auto';
      audio.load();
      return audio;
    });
    this.lastPoeweeVoiceIndex = -1;

    this.ready = false;
    this.keys = new Set();
    this.lastTime = 0;

    this.obstacles = [];
    this.bins = [];
    this.items = [];
    this.effects = [];

    this.score = 0;
    this.trashRemaining = 0;
    this.totalTrash = 0;
    this.won = false;

    this.hudTrashEl = document.getElementById('hud-trash-value');
    this.hudScoreEl = document.getElementById('hud-score-value');
    this.loadingScreen = document.getElementById('loading-screen');
    this.loadingBar = document.getElementById('loading-bar-fill');
    this.loadingText = document.getElementById('loading-text');
    this.endScreen = document.getElementById('end-screen');
    this.endScoreEl = document.getElementById('end-score');
    this.restartButton = document.getElementById('restart-button');
    this.homeButton = document.getElementById('home-button');
    this.continueButton = document.getElementById('continue-button');

    // Lista de dibujado reutilizada cada frame (ver render()): evita
    // asignar un array y funciones flecha nuevas 60 veces por segundo.
    this.renderList = [];

    // loop() se vincula UNA sola vez aquí; antes se pasaba una función
    // flecha nueva "(t) => this.loop(t)" a requestAnimationFrame en cada
    // fotograma, generando basura de forma continua durante toda la
    // partida (una de las causas de la degradación de rendimiento con
    // el tiempo).
    this.loop = this.loop.bind(this);

    this.bindInput();
    this.restartButton.addEventListener('click', () => this.restart());
    // "Volver al inicio" regresa a la portada del proyecto completo (misma navegación
    // que se usó para entrar al minijuego, en sentido inverso).
    this.homeButton.addEventListener('click', () => {
      window.location.href = '../index.html';
    });
    // "Continuar" lleva de vuelta al proyecto principal, indicándole que muestre
    // directamente el cartel posterior al minijuego (misma estética del cuento).
    this.continueButton.addEventListener('click', () => {
      window.location.href = '../index.html?scene=cartel2';
    });

    // "Saltar juego": disponible durante toda la partida. Cierra el minijuego y
    // continúa la historia exactamente por el mismo camino que si se hubiera
    // completado normalmente (misma navegación que el botón "Continuar" de arriba).
    this.skipButton = document.getElementById('skip-button');
    this.skipButton.addEventListener('click', () => {
      window.location.href = '../index.html?scene=cartel2';
    });
  }

  bindInput() {
    const movementKeys = new Set([
      'w', 'a', 's', 'd',
      'arrowup', 'arrowdown', 'arrowleft', 'arrowright',
    ]);

    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (movementKeys.has(key)) {
        e.preventDefault();
        this.keys.add(key);
      }
    });

    window.addEventListener('blur', () => this.keys.clear());

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (movementKeys.has(key)) {
        e.preventDefault();
        this.keys.delete(key);
      }
    });
  }

  start() {
    this.assets.load((loaded, total) => {
      const pct = Math.round((loaded / total) * 100);
      this.loadingBar.style.width = pct + '%';
      this.loadingText.textContent = `Cargando recursos... ${pct}%`;
    }).then(() => {
      this.setupWorld();
      this.ready = true;
      this.loadingScreen.classList.add('hidden');
      requestAnimationFrame(this.loop);
    });
  }

  setupWorld() {
    // Lápidas y cruces
    this.obstacles = STONES_DATA.map((data) => {
      const image = this.assets.get(data.asset);
      const baseWidthFrac = data.kind === 'cross' ? 0.5 : 0.62;
      const baseHeightFrac = data.kind === 'cross' ? 0.24 : 0.32;
      return new Obstacle(image, data.x, data.y, data.w, data.h, baseWidthFrac, baseHeightFrac);
    });

    // Cubos de reciclaje
    this.bins = BINS_DATA.map((data) => {
      const image = this.assets.get(data.asset);
      return new Bin(image, data);
    });
    this.obstacles.push(...this.bins);

    // Basura
    this.items = ITEMS_DATA.map((data) => {
      const image = this.assets.get(data.asset);
      return new Item(image, data);
    });
    this.totalTrash = this.items.length;
    this.trashRemaining = this.totalTrash;

    // Sibille
    const sibilleImage = this.assets.get('sibille');
    const animation = new Animation(sibilleImage, SPRITE_COLUMNS, SPRITE_ROWS);
    this.player = new Player(animation, WORLD_WIDTH / 2, 700);

    // Poewee - aparece en una posición aleatoria de la zona jugable,
    // lejos de obstáculos, cada vez que empieza la partida.
    const poeweeImage = this.assets.get('poewee');
    const poeweeAnimation = new Animation(poeweeImage, SPRITE_COLUMNS, SPRITE_ROWS);
    const poeweeProtestImage = this.assets.get('poeweeProtest');
    const poeweeProtestAnimation = new Animation(
      poeweeProtestImage,
      POEWEE_PROTEST_COLUMNS,
      POEWEE_PROTEST_ROWS,
      POEWEE_PROTEST_REGION
    );
    const spawn = this.findRandomFreeSpot();
    this.poewee = new Poewee(
      poeweeAnimation,
      poeweeProtestAnimation,
      spawn.x,
      spawn.y,
      () => this.playRandomPoeweeVoice()
    );

    this.updateHUD();
  }

  // Busca un punto aleatorio dentro de la zona jugable que no se solape
  // con ningún obstáculo. Se usa para colocar a Poewee al empezar la
  // partida. Con pocos intentos basta dado lo disperso del escenario;
  // si por mala suerte no encuentra ninguno, cae de vuelta al centro.
  findRandomFreeSpot() {
    for (let attempt = 0; attempt < POEWEE_DEST_ATTEMPTS; attempt++) {
      const x = WORLD_BOUNDS.minX + POEWEE_EDGE_MARGIN +
        Math.random() * (WORLD_BOUNDS.maxX - WORLD_BOUNDS.minX - POEWEE_EDGE_MARGIN * 2);
      const y = WORLD_BOUNDS.minY + POEWEE_EDGE_MARGIN +
        Math.random() * (WORLD_BOUNDS.maxY - WORLD_BOUNDS.minY - POEWEE_EDGE_MARGIN * 2);
      if (Collision.isPointFree(x, y, POEWEE_COLLISION_RADIUS, this.obstacles)) {
        return { x, y };
      }
    }
    return { x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 };
  }

  restart() {
    this.score = 0;
    this.won = false;
    this.effects = [];
    this.endScreen.classList.add('hidden');
    this.setupWorld();
  }

  loop(timestamp) {
    const dt = Math.min(0.05, (timestamp - this.lastTime) / 1000 || 0);
    this.lastTime = timestamp;

    this.update(dt);
    this.render();

    requestAnimationFrame(this.loop);
  }

  update(dt) {
    if (!this.ready || this.won) return;

    let dx = 0;
    let dy = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;

    this.player.tryMove(dx, dy, this.obstacles, dt);
    this.player.updateAnimation(dt);

    this.poewee.update(dt, this.player, this.obstacles);
    this.poewee.updateAnimation(dt);

    this.checkPickup();
    this.checkRecycle();

    for (let i = this.effects.length - 1; i >= 0; i--) {
      this.effects[i].update(dt);
      if (this.effects[i].finished) this.effects.splice(i, 1);
    }
  }

  checkPickup() {
    if (this.player.carrying) return;

    for (const item of this.items) {
      if (item.collected) continue;
      const d = Collision.distance(this.player.x, this.player.y, item.x, item.y);
      if (d < PICKUP_RADIUS) {
        item.collected = true;
        this.player.carrying = { type: item.type, image: item.image };
        break;
      }
    }
  }

  // Elige una de las cinco frases de Poewee al azar y la reproduce.
  // Reutiliza siempre las mismas instancias de Audio (creadas una única
  // vez en el constructor). Excluye la última frase reproducida del
  // sorteo para que no se repita dos veces seguidas: entre las 4
  // restantes, cada una tiene la misma probabilidad de salir.
  playRandomPoeweeVoice() {
    const voices = this.poeweeVoices;
    if (!voices || voices.length === 0) return;

    let index = Math.floor(Math.random() * voices.length);
    if (voices.length > 1) {
      while (index === this.lastPoeweeVoiceIndex) {
        index = Math.floor(Math.random() * voices.length);
      }
    }
    this.lastPoeweeVoiceIndex = index;

    const audio = voices[index];
    // Si por lo que sea siguiera sonando de una protesta anterior, se
    // reinicia; si no, esto no tiene efecto perceptible.
    audio.currentTime = 0;
    audio.play().catch((err) => {
      console.warn('No se pudo reproducir la frase de Poewee:', err);
    });
  }

  checkRecycle() {
    if (!this.player.carrying) {
      // Sin nada en las manos no hay intento de reciclaje en curso.
      this.player.wrongBinId = null;
      return;
    }

    let insideAnyWrongBin = false;

    for (const bin of this.bins) {
      const d = Collision.distance(this.player.x, this.player.y, bin.centerX, bin.centerY);
      if (d < BIN_RADIUS) {
        if (bin.accepts === this.player.carrying.type) {
          this.player.carrying = null;
          this.player.wrongBinId = null;
          this.score += RECYCLE_REWARD;
          this.trashRemaining--;
          this.effects.push(new RecycleEffect(bin.centerX, bin.y - 6));
          this.updateHUD();

          if (this.trashRemaining <= 0) {
            this.win();
          }

          // CAUSA REAL DEL BLOQUEO: los tres cubos están a ~80px entre sí
          // y BIN_RADIUS es 72px, así que sus radios de detección se
          // solapan; es habitual estar dentro del radio de dos cubos a
          // la vez. Sin este 'break', tras reciclar (carrying = null) el
          // bucle seguía comprobando el siguiente cubo y evaluaba
          // this.player.carrying.type sobre null, lanzando un TypeError
          // no capturado dentro de update(). Esa excepción interrumpía
          // la función antes de llegar a requestAnimationFrame() en
          // loop(), así que el bucle del juego dejaba de reprogramarse
          // y el juego se quedaba congelado en el sitio.
          break;
        }

        // Cubo equivocado: la basura sigue con Sibille (no se pierde,
        // puede seguir buscando el cubo correcto), pero se penaliza. Sólo
        // se resta la primera vez que entra en el radio de ESTE cubo
        // concreto; mientras siga solapado con él no se le vuelve a
        // restar en cada fotograma. Si se aleja y vuelve a intentarlo,
        // sí se le penaliza de nuevo.
        insideAnyWrongBin = true;
        if (this.player.wrongBinId !== bin.id) {
          this.player.wrongBinId = bin.id;
          this.score = Math.max(0, this.score - MISTAKE_PENALTY);
          this.effects.push(new MistakeEffect(bin.centerX, bin.y - 6));
          this.updateHUD();

          // --- DIAGNÓSTICO TEMPORAL (quitar cuando se localice la causa) ---
          console.log('[audio debug] readyState:', this.pigGruntSound.readyState);
          console.log('[audio debug] networkState:', this.pigGruntSound.networkState);
          console.log('[audio debug] error:', this.pigGruntSound.error);
          console.log('[audio debug] src:', this.pigGruntSound.src);
          // -------------------------------------------------------------

          // Gruñido del cerdo, en el mismo instante que el "¡Idiota!".
          // Se reutiliza siempre la misma instancia de Audio (cargada una
          // sola vez en el constructor); si ya estuviera sonando por un
          // error anterior, se reinicia a 0 para que vuelva a oírse desde
          // el principio de inmediato en vez de solaparse o ignorarse.
          this.pigGruntSound.currentTime = 0;
          this.pigGruntSound.play().catch(() => {});
        }
      }
    }

    if (!insideAnyWrongBin) {
      this.player.wrongBinId = null;
    }
  }

  win() {
    this.won = true;
    this.endScoreEl.textContent = `Puntuación final: ${this.score}`;
    this.endScreen.classList.remove('hidden');
  }

  updateHUD() {
    this.hudTrashEl.textContent = this.trashRemaining;
    this.hudScoreEl.textContent = this.score;
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    const background = this.assets.get('background');
    if (background) {
      ctx.drawImage(background, 0, 0);
    }

    if (!this.ready) return;

    // Lista de entidades ordenadas por profundidad (coordenada Y).
    // Se reutiliza el mismo array en cada frame (sólo se vacía con
    // length = 0, lo que no libera su capacidad interna) y se guardan
    // referencias directas a los objetos: Obstacle, Item y Player
    // comparten la firma draw(ctx), así que no hace falta envolverlos en
    // funciones flecha nuevas cada vez. Antes esto asignaba un array y
    // hasta ~20 closures nuevas 60 veces por segundo, generando basura
    // de forma constante durante toda la partida.
    const renderList = this.renderList;
    renderList.length = 0;

    for (const obstacle of this.obstacles) {
      renderList.push(obstacle);
    }

    for (const item of this.items) {
      if (item.collected) continue;
      renderList.push(item);
    }

    renderList.push(this.player);
    renderList.push(this.poewee);

    renderList.sort(sortByDepth);
    for (const entity of renderList) entity.draw(ctx);

    // Efectos de reciclaje siempre visibles por encima de todo.
    for (const effect of this.effects) effect.draw(ctx);
  }
}

/* ---------------------------------------------------------------------- *
 *  Arranque
 * ---------------------------------------------------------------------- */

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas');
  const game = new Game(canvas);
  game.start();
});
