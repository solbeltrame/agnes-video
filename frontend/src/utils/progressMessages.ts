import { t } from '@/i18n'

const legacySimpleStartMessage = String.fromCharCode(
  0x5f00, 0x59cb, 0x7b80, 0x5355, 0x89c6, 0x9891, 0x751f, 0x6210,
) + '...'

export function normalizeProgressMessage(message: string): string {
  return message.split(legacySimpleStartMessage).join(t('progressSimpleStart'))
}
