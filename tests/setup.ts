import Prisma from '@prisma/client'
import customEnv from 'custom-env'
customEnv.env()

// Disable info logging in tests
global.console.info = () => {}
global.console.log = () => {}
