import './src/globals'
import 'mocha/mocha.js'
import './src/logger'
import { AppRegistry } from 'react-native'

import { name as appName } from './app.json'
import App from './src/App'

AppRegistry.registerComponent(appName, () => App)
