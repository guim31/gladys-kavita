// -----------------------------------------------------------------------------
// Texts the integration sends to Gladys outside the widgets (src/widgets.js):
// connection status, errors, the "Test the connection" report, the scene
// action errors and sentences. Four languages, the four of the Gladys
// interface; German says "du", Spanish "usted". test/i18n.test.js checks
// every table.
// -----------------------------------------------------------------------------

import { ERROR_KINDS } from './kavita/client.js';

export const INIT_FAILED = {
  en: 'Initialization failed, check the integration logs.',
  fr: "L'initialisation a échoué, consultez les logs de l'intégration.",
  de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
  es: 'La inicialización ha fallado, consulte los registros de la integración.',
};

export const CONNECTION_TEXT = {
  noServer: {
    en: 'Enter the address of your Kavita server and an API key in the configuration.',
    fr: "Saisissez l'adresse de votre serveur Kavita et une clé d'API dans la configuration.",
    de: 'Gib die Adresse deines Kavita-Servers und einen API-Schlüssel in der Konfiguration ein.',
    es: 'Introduzca la dirección de su servidor Kavita y una clave de API en la configuración.',
  },
  invalid: {
    en: 'The configuration is incomplete: address (e.g. http://192.168.1.2:5000) and API key.',
    fr: "La configuration est incomplète : adresse (ex. http://192.168.1.2:5000) et clé d'API.",
    de: 'Die Konfiguration ist unvollständig: Adresse (z. B. http://192.168.1.2:5000) und API-Schlüssel.',
    es: 'La configuración está incompleta: dirección (p. ej. http://192.168.1.2:5000) y clave de API.',
  },
};

// One short explanation per error kind (src/kavita/client.js).
export const ERROR_TEXT = {
  [ERROR_KINDS.UNREACHABLE]: {
    en: 'the server does not answer',
    fr: 'le serveur ne répond pas',
    de: 'der Server antwortet nicht',
    es: 'el servidor no responde',
  },
  [ERROR_KINDS.TLS]: {
    en: 'certificate refused: use the http:// address on your network',
    fr: 'certificat refusé : utilisez l’adresse en http:// de votre réseau',
    de: 'Zertifikat abgelehnt: Verwende die http://-Adresse in deinem Netzwerk',
    es: 'certificado rechazado: use la dirección http:// de su red',
  },
  [ERROR_KINDS.AUTH]: {
    en: 'API key refused',
    fr: "clé d'API refusée",
    de: 'API-Schlüssel abgelehnt',
    es: 'clave de API rechazada',
  },
  [ERROR_KINDS.FORBIDDEN]: {
    en: 'this API key is not an administrator’s: use the key of an admin user',
    fr: "cette clé d'API n'est pas celle d'un administrateur : utilisez celle d'un admin",
    de: 'dieser API-Schlüssel gehört keinem Administrator: Nimm den Schlüssel eines Admins',
    es: 'esta clave de API no es de un administrador: use la de un usuario admin',
  },
  [ERROR_KINDS.NOT_KAVITA]: {
    en: 'no Kavita server at this address',
    fr: 'aucun serveur Kavita à cette adresse',
    de: 'kein Kavita-Server unter dieser Adresse',
    es: 'no hay ningún servidor Kavita en esta dirección',
  },
  [ERROR_KINDS.REDIRECT]: {
    en: 'the address redirects: enter the final address, with its path',
    fr: "l'adresse redirige : saisissez l'adresse finale, avec son chemin",
    de: 'die Adresse leitet um: Gib die endgültige Adresse mit ihrem Pfad ein',
    es: 'la dirección redirige: introduzca la dirección final, con su ruta',
  },
  [ERROR_KINDS.HTTP]: {
    en: 'unexpected answer, see the logs',
    fr: 'réponse inattendue, voir les logs',
    de: 'unerwartete Antwort, sieh in den Protokollen nach',
    es: 'respuesta inesperada, consulte los registros',
  },
};

// The "Test the connection" report.
export const REPORT_TEXT = {
  en: {
    ok: (version, user) => `Kavita ${version}: connected as ${user}`,
    admin: () => 'administrator',
    reader: () => 'reader key: no volume count, no scan',
    library: (libraries, series) => `${libraries} library(ies), ${series} series`,
    reading: (count) => `${count} series in progress`,
  },
  fr: {
    ok: (version, user) => `Kavita ${version} : connecté en tant que ${user}`,
    admin: () => 'administrateur',
    reader: () => 'clé de lecteur : ni nombre de tomes, ni scan',
    library: (libraries, series) => `${libraries} bibliothèque(s), ${series} série(s)`,
    reading: (count) => `${count} série(s) en cours`,
  },
  de: {
    ok: (version, user) => `Kavita ${version}: verbunden als ${user}`,
    admin: () => 'Administrator',
    reader: () => 'Leser-Schlüssel: keine Bandanzahl, kein Scan',
    library: (libraries, series) => `${libraries} Bibliothek(en), ${series} Serie(n)`,
    reading: (count) => `${count} laufende Serie(n)`,
  },
  es: {
    ok: (version, user) => `Kavita ${version}: conectado como ${user}`,
    admin: () => 'administrador',
    reader: () => 'clave de lector: sin número de tomos ni escaneo',
    library: (libraries, series) => `${libraries} biblioteca(s), ${series} serie(s)`,
    reading: (count) => `${count} serie(s) en curso`,
  },
};

// The sentence of the "Read the latest additions" scene action.
export const RECENT_TEXT = {
  en: {
    none: (days) => `Nothing new on Kavita in the last ${days} days.`,
    some: (count, days, titles) =>
      `${count} new series on Kavita in the last ${days} days: ${titles}.`,
    more: (count) => `${count} more`,
    and: ' and ',
  },
  fr: {
    none: (days) => `Rien de nouveau sur Kavita ces ${days} derniers jours.`,
    some: (count, days, titles) =>
      `${count} nouvelle(s) série(s) sur Kavita ces ${days} derniers jours : ${titles}.`,
    more: (count) => `${count} autre(s)`,
    and: ' et ',
  },
  de: {
    none: (days) => `Nichts Neues auf Kavita in den letzten ${days} Tagen.`,
    some: (count, days, titles) =>
      `${count} neue Serie(n) auf Kavita in den letzten ${days} Tagen: ${titles}.`,
    more: (count) => `${count} weitere`,
    and: ' und ',
  },
  es: {
    none: (days) => `Nada nuevo en Kavita en los últimos ${days} días.`,
    some: (count, days, titles) =>
      `${count} serie(s) nueva(s) en Kavita en los últimos ${days} días: ${titles}.`,
    more: (count) => `${count} más`,
    and: ' y ',
  },
};

// Errors of the scene actions and widget buttons (shown in Gladys).
export const ACTION_TEXT = {
  noServer: {
    en: 'No Kavita server is configured.',
    fr: "Aucun serveur Kavita n'est configuré.",
    de: 'Kein Kavita-Server ist konfiguriert.',
    es: 'No hay ningún servidor Kavita configurado.',
  },
  unknownLibrary: {
    en: 'No library of this name on the Kavita server.',
    fr: 'Aucune bibliothèque de ce nom sur le serveur Kavita.',
    de: 'Keine Bibliothek mit diesem Namen auf dem Kavita-Server.',
    es: 'No hay ninguna biblioteca con este nombre en el servidor Kavita.',
  },
};

// Toast of the "Scan the libraries" widget button (≤ 200 characters).
export const DONE_TEXT = {
  en: { scanned: (count) => `Scan of ${count} library(ies) started.` },
  fr: { scanned: (count) => `Scan de ${count} bibliothèque(s) lancé.` },
  de: { scanned: (count) => `Scan von ${count} Bibliothek(en) gestartet.` },
  es: { scanned: (count) => `Escaneo de ${count} biblioteca(s) iniciado.` },
};

export const LANGUAGE_FALLBACK = 'en';

/** "Name: text", with the space French puts before a colon. */
export const labelled = (name, text, language) =>
  `${name}${language === 'fr' ? ' : ' : ': '}${text}`;
export const pick = (text, language) => text[language] ?? text[LANGUAGE_FALLBACK];

/** Every language of a table, rendered by `render(table[language], language)`. */
export const everyLanguage = (table, render) =>
  Object.fromEntries(
    Object.entries(table).map(([language, text]) => [language, render(text, language)]),
  );

/** "A, B and 2 more" in the words of a language. */
export function listOf(titles, total, text) {
  const shown = titles.slice(0, 3);
  const rest = total - shown.length;
  const parts = rest > 0 ? [...shown, text.more(rest)] : shown;
  return parts.length <= 1
    ? parts.join('')
    : `${parts.slice(0, -1).join(', ')}${text.and}${parts.at(-1)}`;
}
