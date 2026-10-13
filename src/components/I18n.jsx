import {h, createContext} from 'preact'
import {useContext, useEffect, useMemo, useState} from 'preact/hooks'
import {translate} from '../core/i18n.mjs'
const Locale = createContext({
  language: 'en',
  setLanguage: () => {},
  t: (key, ...values) => translate('en', key, ...values),
})
export function I18nProvider({children}) {
  const [language, setLanguage] = useState(() => {
    try {
      return localStorage.getItem('feynman-language') === 'zh' ? 'zh' : 'en'
    } catch {
      return 'en'
    }
  })
  useEffect(() => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en'
    try {
      localStorage.setItem('feynman-language', language)
    } catch {}
    window.webkit?.messageHandlers?.language?.postMessage(language)
  }, [language])
  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (key, ...values) => translate(language, key, ...values),
    }),
    [language],
  )
  return <Locale.Provider value={value}>{children}</Locale.Provider>
}
export const useLocale = () => useContext(Locale)
export const useI18n = () => useLocale().t
