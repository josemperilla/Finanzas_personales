# Ayudas visuales del asistente SMS (iOS)

El componente `SmsSetupWizard.tsx` referencia estas imágenes por ruta absoluta
(`/onboarding/ios/...`). Si un archivo no existe todavía, el wizard simplemente
lo oculta (`GuideImg` con `onError`), así que se puede shippear sin ellas y
agregarlas después sin tocar código.

Capturas recomendadas (idealmente con la UI del iPhone en inglés, que es donde
más se confunde la gente):

| Archivo | Qué mostrar |
|---|---|
| `02-automation-tab.png` | La pestaña *Automation* + el botón **+** |
| `03-message-contains.png` | El trigger *Message* con `$` en *Contains* y *Sender: Any* |
| `04-toggles.png` (o `.gif`) | **La más importante:** *Run Immediately* ON y *Run After Confirmation* OFF |
| `05-choose-shortcut.png` | Elegir *Run Shortcut → Finanzas SMS* |

Mantener cada archivo por debajo de ~1 MB (GIF para el de toggles) para no
inflar el bundle de la PWA.
