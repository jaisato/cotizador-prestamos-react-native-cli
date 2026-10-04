# Cotizador de préstamos

App de React Native que calcula la cuota mensual y el total a pagar de un
préstamo a partir de la cantidad, el interés mensual (en %) y el plazo (3, 6,
12 o 24 meses), como un préstamo de cuota fija.

Fork de [xAgustin93/cotizador-prestamos-react-native-cli](https://github.com/xAgustin93/cotizador-prestamos-react-native-cli),
migrado de React Native 0.62.3 a **React Native 0.87.1**.

## Requisitos

- **Node** 22.13 o posterior dentro de la 22, 24.3 o posterior dentro de la 24,
  o 26 en adelante: las mismas versiones que admite React Native 0.87.
  `.nvmrc` fija la 24, con la que se prueba en local y en el CI; con
  [nvm](https://github.com/nvm-sh/nvm), `nvm install` y `nvm use` la leen. Las
  dependencias se instalan con npm a partir de `package-lock.json`; el
  proyecto ya no usa yarn.
- **Android**: JDK 17 y el SDK de Android (Android Studio, o las command-line
  tools con `ANDROID_HOME` apuntando al SDK). Se compila contra la plataforma
  37 con build-tools 37.0.0 y el NDK 27.1.12297006; Gradle los descarga si
  faltan y las licencias están aceptadas (`sdkmanager --licenses`). La app
  funciona en Android 7.0 (API 24) o posterior.
- **iOS**, solo en macOS: Xcode 16.1 o posterior y CocoaPods, que se instala
  con Bundler desde `Gemfile` y `Gemfile.lock` (Ruby 3.1 o posterior; el CI usa
  la 3.3). La app es para iPhone con iOS 15.1 o posterior.

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

La primera vez, y cada vez que cambien las dependencias nativas (un módulo
nativo nuevo o actualizado, el `Podfile` o el `Gemfile`):

```sh
npm run ios -- --force-pods
```

Después basta con:

```sh
npm run ios
```

En React Native 0.87, llamar a `pod install` directamente está obsoleto: se
encarga la CLI. Con `--force-pods`, antes de compilar ejecuta Codegen,
`bundle install` y `pod install`. Sin la opción, solo reinstala los pods si
detecta cambios, y entonces no ejecuta Codegen; por eso conviene forzarlo
tras un cambio nativo. Para instalar los pods sin compilar, como hace el CI:
`npx react-native build-ios --only-pods`.

`ios/Podfile.lock`, `ios/cotizadorprestamos.xcworkspace` y `Gemfile.lock`
están versionados. `project.pbxproj` trae ya las fases `[CP]` de CocoaPods y
los ajustes que añade `pod install` (`USE_HERMES`, `REACT_NATIVE_PATH`,
`SWIFT_ACTIVE_COMPILATION_CONDITIONS` y `PrivacyInfo.xcprivacy` como
recurso). Si `pod install` cambia alguno de esos ficheros, hay que commitear
el cambio: el workflow de iOS falla si los encuentra distintos y deja el
parche como artefacto.

## Comprobaciones

```sh
npm run lint
npx tsc --noEmit
npm test             # Jest: el cálculo, la pantalla y la maquetación por plataforma
npm run test:audit   # el script de auditoría, con un npm falso
npm run audit:ci
```

`npm test` es Jest 30 con el preset `@react-native/jest-preset` 0.87.1, y solo
recoge `__tests__/`: `scripts/audit-ci.test.mjs` es de `node --test`. El
preset sigue dependiendo de `babel-jest` y `jest-environment-node` 29. Jest 30
transforma con su propio `babel-jest`, y los tests corren en el entorno del
preset, que se apoya en `jest-environment-node` 29.

## CI

`.github/workflows/ci.yml` se ejecuta en cada PR y en cada push a `master`:

- `js`: lint, TypeScript, Jest, los tests del script de auditoría, la
  auditoría y los bundles de Metro de Android e iOS (`react-native bundle
  --dev false`).
- `dependency-review`, solo en las PR: compara el grafo de dependencias de la
  PR con el de `master` en todos los manifiestos que lee GitHub
  (`package-lock.json`, `Gemfile`, `Gemfile.lock`, las acciones) y falla con
  cualquier aviso nuevo, de cualquier severidad, salvo el de braces. Cubre lo
  que `npm audit` no ve, como las gemas de CocoaPods.
- `android`: `./gradlew assembleDebug assembleRelease` con JDK 17.
  `setup-gradle` comprueba `gradle-wrapper.jar` con las sumas que publica
  Gradle, y el wrapper comprueba la de la distribución
  (`distributionSha256Sum`). Deja como artefactos `app-debug.apk` y
  `app-release-debugkey.apk` (ver [Firma de Android](#firma-de-android)).

`.github/workflows/ios.yml` compila la app de iOS en macOS:

- Se lanza al poner la etiqueta `ios` en una PR, a mano (_Run workflow_) y en
  cada push a `master` que cambie `ios/`, `package-lock.json`, `Gemfile*` o el
  propio workflow. Para repetirlo en una PR, quita la etiqueta y vuelve a
  ponerla. Dependabot la pone en sus PR de npm y Bundler.
- No es por coste: el repo es público y los runners estándar de GitHub,
  también los de macOS, son gratuitos. Corre cuando puede cambiar algo de iOS,
  que es lo que vigilan sus disparadores, para que una PR que solo toca
  JavaScript no espere a un runner de macOS, que tiene menos concurrencia que
  los de Linux (5 trabajos a la vez en el plan gratuito). Una PR que cambie
  `ios/`, `package-lock.json` o `Gemfile*` debe llevar la etiqueta antes de
  fusionarse; si no, el push a `master` lo detecta después.
- Instala los pods con `npx react-native build-ios --only-pods`, compila Debug
  y Release para el simulador sin firmar y comprueba el `.app` de Release:
  `main.jsbundle` en bytecode de Hermes, `PrivacyInfo.xcprivacy` incluido,
  solo iPhone y solo en vertical.
- Si `pod install` cambia algo versionado (`ios/` o `Gemfile.lock`), sube el
  artefacto `ios-pod-install.patch` y el job falla al final. El parche se
  aplica con `git apply --index ios-pod-install.patch` y se commitea.

### Descargar los artefactos

Los artefactos se suben sin comprimir (`archive: false`). En la web, la
sección _Artifacts_ de la ejecución descarga el fichero tal cual.
`gh run download` no sirve, porque espera un zip y falla con
`zip: not a valid zip file`. Con `gh`:

```sh
# Los artefactos de una ejecución, con su id
gh api repos/jaisato/cotizador-prestamos-react-native-cli/actions/runs/<run>/artifacts \
  --jq '.artifacts[] | "\(.id) \(.name)"'

# Uno de ellos: pese al /zip, la respuesta es el fichero sin comprimir
gh api repos/jaisato/cotizador-prestamos-react-native-cli/actions/artifacts/<id>/zip > <nombre>
```

### Dependabot

`.github/dependabot.yml` propone cada semana una PR agrupada para npm, otra
para Bundler (las gemas de CocoaPods) y otra para las acciones de GitHub:

- No propone minors de React Native, porque traen cambios en `android/` e
  `ios/` y se actualizan con la plantilla o el
  [Upgrade Helper](https://react-native-community.github.io/upgrade-helper/).
  Tampoco versiones de `react` y `react-test-renderer`, que solo se mueven con
  React Native.
- Por lo mismo, `cocoapods` y `xcodeproj`, que fija la plantilla, solo reciben
  parches, y `activesupport` no pasa de la 7, porque cocoapods-core lo limita
  a menos de la 8.
- `Gemfile.lock` lista la plataforma `x86_64-linux`, además de `ruby`, para
  que Dependabot pueda resolverlo en Linux.

## Firma de Android

`android/app/debug.keystore` es el de la plantilla de React Native: su clave y
su contraseña (`android`) son públicas, y cualquiera puede firmar con ellas.
Firma los builds de debug y, como en la plantilla, también el de release del
CI. Por eso `app-release-debugkey.apk` es solo para probar: no se publica ni
se distribuye.

Para publicar, genera una clave de subida fuera del repo:

```sh
mkdir -p ~/.android-keys
keytool -genkeypair -v -storetype PKCS12 \
  -keystore ~/.android-keys/cotizador-upload.keystore \
  -alias cotizador-upload -keyalg RSA -keysize 2048 -validity 10000
```

Pon la ruta y las contraseñas en `~/.gradle/gradle.properties`, no en
`android/gradle.properties`, que está versionado:

```properties
COTIZADOR_UPLOAD_STORE_FILE=/ruta/a/.android-keys/cotizador-upload.keystore
COTIZADOR_UPLOAD_KEY_ALIAS=cotizador-upload
COTIZADOR_UPLOAD_STORE_PASSWORD=...
COTIZADOR_UPLOAD_KEY_PASSWORD=...
```

En `android/app/build.gradle`, añade a `signingConfigs` una configuración
`release` que lea esas propiedades, y úsala en el `buildType` de release
cuando existan:

```groovy
signingConfigs {
    // debug { ... } se queda como está
    release {
        if (project.hasProperty('COTIZADOR_UPLOAD_STORE_FILE')) {
            storeFile file(COTIZADOR_UPLOAD_STORE_FILE)
            storePassword COTIZADOR_UPLOAD_STORE_PASSWORD
            keyAlias COTIZADOR_UPLOAD_KEY_ALIAS
            keyPassword COTIZADOR_UPLOAD_KEY_PASSWORD
        }
    }
}
buildTypes {
    release {
        // Sin las propiedades, la de debug, como hasta ahora.
        signingConfig signingConfigs.debug
        if (project.hasProperty('COTIZADOR_UPLOAD_STORE_FILE')) {
            signingConfig signingConfigs.release
        }
        // minifyEnabled y proguardFiles se quedan como están
    }
}
```

`.gitignore` ya excluye cualquier `*.keystore` salvo `debug.keystore`. En un
CI, las propiedades pueden llegar como secretos en variables de entorno
`ORG_GRADLE_PROJECT_COTIZADOR_UPLOAD_*`, con el keystore decodificado a un
fichero temporal. Con Play App Signing, Google firma lo que distribuye y esta
clave solo sirve para subir la app. Más detalles en
<https://reactnative.dev/docs/signed-apk-android>.

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
  mismos de la plantilla, en 0.62 y en 0.87), que sea solo de iPhone y ATS sin
  `NSAllowsArbitraryLoads`. No había splash propio ni fuentes.
- Permisos de Android. En release: `INTERNET`, como antes, y
  `com.cotizadorprestamos.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, un permiso
  de firma que AndroidX core añade al fusionar los manifiestos y que no se le
  pide al usuario. En debug, además, `SYSTEM_ALERT_WINDOW` (el menú de
  desarrollo, ya estaba en 0.62) y `ACCESS_LOCAL_NETWORK` (la conexión con
  Metro), que no llegan al release.
- La app solo tiene tema claro, así que sigue forzándolo: `UIUserInterfaceStyle`
  `Light` en iOS, y en Android `Theme.AppCompat.Light.NoActionBar` con
  `android:forceDarkAllowed` a `false`, para que Android 10 o posterior no la
  oscurezca por su cuenta. Sin eso, en modo oscuro el fondo pasa a negro y el
  resumen, en texto negro, deja de verse.
- El código pasa a TypeScript. El cálculo de la cuota está en
  `src/utils/loan.ts` como función pura, con sus tests en
  `__tests__/loan.test.ts`; la pantalla y la maquetación se prueban en
  `__tests__/App.test.tsx` y `__tests__/layout.test.tsx`.
- `react-native-picker-select` 9 con `@react-native-picker/picker` (el `Picker`
  del núcleo ya no existe), `SafeAreaView` de `react-native-safe-area-context`
  y fuera `YellowBox`, que solo silenciaba el aviso de ese `Picker`.
- npm en lugar de yarn, sin `resolutions`: con 0.87 ya no hacen falta.

Cambios de comportamiento:

- Versiones mínimas: Android 7.0 (antes 4.1) e iOS 15.1 (antes 9.0).
- Solo en vertical. En iPhone antes admitía también horizontal, y en Android
  giraba con el dispositivo; ahora las dos plataformas se quedan en vertical.
  Es una decisión: en horizontal, la cabecera de 290 puntos y el pie de 100 no
  dejan sitio al resumen. Android 16 ignora el bloqueo en pantallas de 600 dp o
  más (tabletas y plegables). En iPad sigue corriendo en modo compatibilidad,
  como en 0.62.
- Android dibuja de borde a borde (edge-to-edge; Android 15 o posterior lo
  impone de todos modos). La barra de estado queda encima de la cabecera azul,
  y la cabecera y su fondo crecen con la altura de la barra para que debajo de
  ella se vea igual que en 0.62. El pie crece con la altura de la barra de
  navegación para que el botón quede encima. En iOS el pie crece igual con el
  indicador de inicio, así que el botón sube 34 pt en los iPhone sin botón de
  inicio.
- Teclado en Android: con edge-to-edge, la ventana ya no se encoge al abrir el
  teclado. Un `KeyboardAvoidingView` con `behavior="height"` encoge la
  pantalla hasta el borde del teclado, y el pie sube por encima, como en 0.62.
  Mientras se escribe, el pie conserva el margen de la barra de navegación.
  Está razonado y probado en Jest, pero no en un dispositivo. En iOS el
  teclado tapa el pie, como en 0.62. El cálculo se rehace al escribir, sin
  pulsar CALCULAR.

## Excepción de `npm audit`: braces (GHSA-vfj7-8cjw-p6xm)

`npm run audit:ci` (`scripts/audit-ci.mjs`) ejecuta `npm audit` y falla con
cualquier aviso salvo uno:
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm),
denegación de servicio en `braces` <= 3.0.3 con patrones muy anidados.

- No hay versión corregida: 3.0.3 es la última publicada, así que no hay nada a
  lo que actualizar ni que forzar con `overrides`.
- Llega por `micromatch`, que usan Metro (el empaquetador, dependencia de
  `react-native`), la CLI de React Native y los paquetes de Jest 29 que trae
  `@react-native/jest-preset`. Se ejecuta al construir y en los tests, con
  patrones del propio proyecto, y no entra en el bundle de la app.
- La excepción vale solo para el paquete `braces`: si el mismo aviso alcanza a
  otro, el script falla.
- Caduca sola. Si `npm audit fix` puede corregirlo, o `npm audit fix --force`
  lo corrige subiendo una versión, el script falla y pide actualizar y quitar
  la excepción. Hoy `npm audit fix --force` propone instalar
  `react-native@0.72.17`; eso es bajar desde 0.87.1, no un parche, así que el
  script lo muestra pero no lo cuenta como arreglo. Si el aviso deja de
  aparecer, avisa para borrar la excepción.
- Una salida de `npm audit` que el script no entiende (un error, otro formato
  de informe o un total que no cuadra) sale con código 2, nunca como un
  informe limpio. `npm run test:audit` lo prueba con un npm falso.
- El job `dependency-review` del CI tiene la misma excepción (`allow-ghsas`),
  para el grafo de dependencias de GitHub.

npm calcula el `fixAvailable` de braces a partir de las dependencias de primer
nivel que llevan hasta él, y el resultado depende del orden en que las
procesa, que cambia de una ejecución a otra. Con Jest 29, `jest` y
`@types/jest` estaban entre ellas y tenían un arreglo de verdad, porque Jest 30
ya no usa micromatch: a veces npm proponía `jest@30.5.2` en vez de
`react-native@0.72.17`, el script lo contaba como arreglo y el CI podía fallar
sin que nada hubiera cambiado. Por eso el proyecto usa Jest 30 y `@types/jest`
30. Las ramas que quedan (`react-native`, `@react-native/metro-config`,
`@react-native-community/cli` y sus plataformas, y `@react-native/jest-preset`)
solo proponen bajar de versión o nada, y el resultado ya no depende del orden.

Fuera de braces, `npm audit` no informa de nada, así que no hay `overrides`. Si
algún día hace falta uno, debe quedarse dentro de la misma versión mayor y
explicarse en esta sección.

`package.json` deniega en `allowScripts` los dos scripts de instalación que
trae Jest 30, que npm 11 ya bloquea por defecto y que no hacen falta:
`@parcel/watcher` (solo compila desde el código fuente si se le pide) y
`unrs-resolver` (solo descarga su binario si falta; `package-lock.json` ya trae
el de cada plataforma). Así `npm ci` no avisa de ellos.
