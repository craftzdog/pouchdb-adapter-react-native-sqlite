import debug from 'debug'

export const logger = {
  debug: debug('pouch-sqlite:debug'),
  error: debug('pouch-sqlite:error'),
}

logger.debug.log = console.log.bind(console)
logger.error.log = console.error.bind(console)
