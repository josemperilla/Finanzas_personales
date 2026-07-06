// Config compartida por popup.js y options.js. Cargar SIEMPRE antes de esos dos
// scripts (ver popup.html / options.html) — sin bundler ni ES modules, los <script>
// sueltos comparten el mismo scope global de la página, así que esta constante
// queda disponible para los scripts que se cargan después.
const DEFAULT_BACKEND = 'https://finanzas-abiertas.pages.dev';
