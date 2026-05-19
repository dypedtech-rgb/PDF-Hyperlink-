# PDF Hyperlink Editor

> Una herramienta web gratuita para editar hipervínculos en archivos PDF, directamente en el navegador. Sin servidores. Sin subida de datos.

## 🔗 Demo en vivo

👉 **[Abrir la herramienta](https://tu-usuario.github.io/pdf-hyperlink-editor/)**

---

## ✨ Características

- **Detección automática** de todos los hipervínculos URI en cualquier PDF
- **Panel de edición** con URL original y campo para la nueva URL
- **Vista previa** del PDF renderizada en tiempo real con overlays sobre los links
- **Navegación por páginas** con indicadores visuales de dónde están los links
- **Búsqueda y filtro** — filtra por URL o muestra solo los modificados
- **Compresión básica** — opción para reducir el tamaño del archivo descargado
- **Descarga directa** — el PDF editado se genera y descarga en el navegador
- **100% privado** — ningún dato sale de tu computadora

---

## 🚀 Uso

1. **Sube tu PDF** — arrastra y suelta o haz clic en "Seleccionar PDF"
2. **Revisa los hipervínculos** detectados en el panel derecho
3. **Edita las URLs** que necesites cambiar
4. Activa **"Comprimir PDF"** si quieres reducir el tamaño del archivo (opcional)
5. Haz clic en **"Descargar PDF Editado"**

---

## 🛠️ Tecnologías

| Librería | Uso |
|----------|-----|
| [pdf-lib](https://pdf-lib.js.org/) | Leer y modificar anotaciones de hipervínculos en el PDF |
| [PDF.js](https://mozilla.github.io/pdf.js/) | Renderizar el preview del PDF en canvas |

Sin frameworks. Sin dependencias de servidor. HTML + CSS + JavaScript puro.

---

## 📋 Limitaciones conocidas

- Solo detecta hipervínculos de tipo **URI** (URLs web). No modifica links internos del documento (GoTo).
- No modifica el **texto visible** del link en el PDF — solo la URL de destino.
- PDFs con **contraseña** no son compatibles.

---

## 🌐 Deploy en GitHub Pages

1. Haz un fork de este repositorio
2. Ve a **Settings → Pages**
3. En *Source*, selecciona `main` branch y carpeta raíz `/`
4. Guarda — tu app estará disponible en `https://tu-usuario.github.io/nombre-repo/`

---

## 📁 Estructura del proyecto

```
├── index.html          # Página principal
├── css/
│   └── styles.css      # Estilos (dark mode, glassmorphism)
├── js/
│   ├── app.js          # Orquestador principal
│   ├── pdf-parser.js   # Extracción de hipervínculos
│   ├── pdf-editor.js   # Modificación y guardado
│   └── pdf-viewer.js   # Renderizado PDF.js
└── assets/
    └── favicon.svg
```

---

## 📄 Licencia

MIT — Libre para uso personal y comercial.
