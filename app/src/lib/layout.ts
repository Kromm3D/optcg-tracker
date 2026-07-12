// Constantes de layout compartidas.

// Ancho máximo del contenido en WEB: la app es mobile-first, así que en el
// navegador la centramos en una columna de este ancho en vez de estirarla de
// borde a borde de la ventana. En nativo no aplica (la pantalla es más estrecha
// que esto). Lo consumen App.tsx (la "carcasa" centrada) y useCardGrid (para
// medir las cartas contra la columna, no contra la ventana).
export const MAX_CONTENT_WIDTH = 480;
