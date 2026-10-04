# Cotizador de préstamos

App de React Native que calcula la cuota mensual y el total a pagar de un
préstamo a partir de la cantidad, el interés mensual (en %) y el plazo (3, 6,
12 o 24 meses), como un préstamo de cuota fija.

Fork de [xAgustin93/cotizador-prestamos-react-native-cli](https://github.com/xAgustin93/cotizador-prestamos-react-native-cli),
migrado de React Native 0.62.3 a **React Native 0.87.1**.

## Requisitos

- **Node 24** (24.3 o posterior, el mínimo de React Native 0.87 dentro de la
  24), con [nvm](https://github.com/nvm-sh/nvm): `nvm install` y `nvm use` leen
  la versión de `.nvmrc`. Las dependencias se instalan con npm a partir de
  `package-lock.json`; el proyecto ya no usa yarn.
- **Android**: JDK 17 y el SDK de Android (Android Studio, o las command-line
  tools con `ANDROID_HOME` apuntando al SDK). Se compila contra la plataforma
  37 con build-tools 37.0.0 y el NDK 27.1.12297006; Gradle los descarga si
  faltan y las licencias están aceptadas (`sdkmanager --licenses`). La app
  funciona en Android 7.0 (API 24) o posterior.
- **iOS**, solo en macOS: Xcode 16.1 o posterior y CocoaPods, que se instala
  con Bundler desde el `Gemfile` (Ruby 2.6.10 o posterior). La app funciona en
  iOS 15.1 o posterior.

## Arrancar

```sh
nvm use
npm ci
npm start          # Metro; déjalo abierto en otra terminal
```

### Android

Con un emulador abierto o un dispositivo conectado:

```sh
npm run android
```

### iOS

La primera vez, y cada vez que cambien las dependencias nativas:

```sh
bundle install
cd ios && bundle exec pod install && cd ..
```

Después:

```sh
npm run ios
```

`pod install` genera `ios/Podfile.lock` y `ios/cotizadorprestamos.xcworkspace`,
y añade la integración de CocoaPods a `project.pbxproj`. La migración se hizo
sin un Mac, así que todavía no están versionados: hazlo la primera vez que lo
ejecutes. El job `ios` del CI sube como artefacto el `Podfile.lock` que genera.

## Comprobaciones

```sh
npm run lint
npx tsc --noEmit
npm test
npm run audit:ci
```

El CI (`.github/workflows/ci.yml`) tiene tres jobs:

- `js`: lint, TypeScript, Jest, la auditoría y los bundles de Metro de Android
  e iOS (`react-native bundle --dev false`).
- `android`: `./gradlew assembleDebug assembleRelease` con JDK 17. El release
  se firma con la clave de debug, como en la plantilla; los dos APK quedan como
  artefactos de la ejecución.
- `ios`: `pod install` y `xcodebuild` del workspace para el simulador, sin
  firmar. Para no gastar minutos de macOS en cada push, solo se lanza a mano
  (_Run workflow_) o al poner la etiqueta `ios` a una PR; para repetirlo en la
  misma PR, quita la etiqueta y vuelve a ponerla.

Dependabot (`.github/dependabot.yml`) propone cada semana una PR agrupada con
las dependencias de npm y otra con las acciones de GitHub. No propone minors
de React Native (traen cambios en `android/` e `ios/`, se actualizan con la
plantilla o el [Upgrade Helper](https://react-native-community.github.io/upgrade-helper/))
ni versiones de `react` y `react-test-renderer`, que solo se mueven con React
Native.

## Migración de 0.62 a 0.87

`android/`, `ios/` y la configuración de herramientas se regeneraron con
`npx @react-native-community/cli@20.2.0 init cotizadorprestamos --version 0.87.1`:

- Android en Kotlin con el plugin de Gradle de React Native (Gradle 9.4, AGP
  9.2, compileSdk 37, targetSdk 36, minSdk 24); iOS con el `AppDelegate` en
  Swift, `LaunchScreen.storyboard` y `PrivacyInfo.xcprivacy`. Hermes y la nueva
  arquitectura (Fabric y TurboModules) vienen activados. Se van Flipper, BUCK y
  los targets de tvOS.
- Se conserva lo que define la app: el nombre `cotizadorprestamos` (registro
  en `AppRegistry`, `app.json` y nombre visible), el `applicationId` y
  namespace `com.cotizadorprestamos`, el bundle id
  `org.reactjs.native.example.cotizadorprestamos`, los iconos de Android (los
  mismos de la plantilla, en 0.62 y en 0.87), el permiso `INTERNET` como único
  permiso y ATS sin `NSAllowsArbitraryLoads`. No había splash propio ni
  fuentes.
- La app solo tiene tema claro, así que sigue forzándolo: `UIUserInterfaceStyle`
  `Light` en iOS y `Theme.AppCompat.Light.NoActionBar` en Android. Sin eso, en
  modo oscuro el fondo de iOS pasa a negro y el resumen, en texto negro, deja de
  verse.
- El código pasa a TypeScript. El cálculo de la cuota está en
  `src/utils/loan.ts` como función pura, con sus tests en
  `__tests__/loan.test.ts`.
- `react-native-picker-select` 9 con `@react-native-picker/picker` (el `Picker`
  del núcleo ya no existe), `SafeAreaView` de `react-native-safe-area-context`
  y fuera `YellowBox`, que solo silenciaba el aviso de ese `Picker`.
- npm en lugar de yarn, sin `resolutions`: con 0.87 ya no hacen falta.

Cambios de comportamiento:

- Versiones mínimas: Android 7.0 (antes 4.1) e iOS 15.1 (antes 9.0).
- iOS: la app es universal (antes solo iPhone; en iPad corría en modo
  compatibilidad). En iPhone solo admite vertical (antes también horizontal);
  en iPad, las cuatro orientaciones. Es lo que trae la plantilla.
- Android dibuja de borde a borde (edge-to-edge; Android 15 o posterior lo
  impone de todos modos): la cabecera azul llega por detrás de la barra de
  estado y el pie crece con la altura de la barra de navegación para que el
  botón quede encima. En iOS el pie crece igual con el indicador de inicio, así
  que el botón sube 34 pt en los iPhone sin botón de inicio.
- Android, sin probar en dispositivo: con edge-to-edge la ventana ya no se
  encoge al abrir el teclado, así que el teclado tapa el pie, como ya pasaba en
  iOS. El cálculo se rehace al escribir, sin pulsar CALCULAR.

## Excepción de `npm audit`: braces (GHSA-vfj7-8cjw-p6xm)

`npm run audit:ci` (`scripts/audit-ci.mjs`) ejecuta `npm audit` y falla con
cualquier aviso salvo uno:
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
denegación de servicio en `braces` <= 3.0.3 con patrones muy anidados.

- No hay versión corregida: 3.0.3 es la última publicada, así que no hay nada a
  lo que actualizar ni que forzar con `overrides`.
- Llega por `micromatch`, que usan Metro (el empaquetador, dependencia de
  `react-native`) y Jest. Se ejecuta al construir y en los tests, con patrones
  del propio proyecto, y no entra en el bundle de la app.
- La excepción caduca sola: si `npm audit fix` puede corregirlo, el script
  falla y pide actualizar y quitarla. Si el aviso deja de aparecer, avisa para
  borrarla.

Fuera de braces, `npm audit` no informa de nada, así que no hay `overrides`. Si
algún día hace falta uno, debe quedarse dentro de la misma versión mayor y
explicarse en esta sección.
