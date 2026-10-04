package com.cotizadorprestamos

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "cotizadorprestamos"

  /**
   * Returns the instance of the [ReactActivityDelegate]. The New Architecture is always on since
   * React Native 0.82, so [DefaultReactActivityDelegate] no longer takes a fabricEnabled flag.
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName)
}
