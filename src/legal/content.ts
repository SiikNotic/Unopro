// Carta Casino's legal and information texts, in Spanish and English. Built from the code audit
// (docs/compliance/AUDIT.md): every statement about data describes what the code and its providers do.
// Items marked "REVISIÓN LEGAL" / "LEGAL REVIEW" must be checked by a professional; this is not legal advice.
// The same texts are published as static pages by `npm run legal:build` (public/legal/).
import { LEGAL_CONFIG } from './config';

export type LegalLang = 'es' | 'en';
export type DocId = 'notice' | 'virtual' | 'responsible' | 'privacy' | 'terms' | 'deletion' | 'contact';
export const DOC_IDS: DocId[] = ['notice', 'virtual', 'responsible', 'privacy', 'terms', 'deletion', 'contact'];

export interface LegalSection {
  h: string;
  p: string[];
}
export interface LegalDoc {
  id: DocId;
  title: string;
  summary: string;
  sections: LegalSection[];
}

const pending = (lang: LegalLang) => (lang === 'es' ? '[pendiente de configurar]' : '[to be configured]');
const fill = (lang: LegalLang) => ({
  owner: LEGAL_CONFIG.owner ?? pending(lang),
  contact: LEGAL_CONFIG.contactEmail ?? pending(lang),
  age: LEGAL_CONFIG.minimumAge ? String(LEGAL_CONFIG.minimumAge) : pending(lang),
});

/** The one sentence about coins that appears everywhere. */
export const VIRTUAL_STATEMENT: Record<LegalLang, string> = {
  es: 'Las monedas y fichas utilizadas en Carta Casino son virtuales, no tienen valor monetario y no pueden comprarse, venderse, retirarse ni canjearse por dinero, productos, servicios o premios de valor real.',
  en: 'The coins and chips used in Carta Casino are virtual, have no monetary value and cannot be bought, sold, withdrawn or exchanged for money, products, services or prizes of real value.',
};

function es(): LegalDoc[] {
  const f = fill('es');
  return [
    {
      id: 'notice',
      title: 'Información importante',
      summary: 'Carta Casino es un juego de entretenimiento con juegos de casino simulados.',
      sections: [
        {
          h: 'Qué es Carta Casino',
          p: [
            'Carta Casino es un juego de entretenimiento con juegos de casino simulados (póker, blackjack, ruleta, tragamonedas) y otros juegos de cartas y mesa.',
            'Las monedas y fichas son virtuales. No representan dinero real, no pueden convertirse en dinero, no pueden retirarse y no ofrecen premios de valor real.',
            'La aplicación no ofrece apuestas con dinero real. No se pueden comprar monedas.',
            VIRTUAL_STATEMENT.es,
          ],
        },
        {
          h: 'Anuncios recompensados',
          p: [
            'Los anuncios recompensados son opcionales. En la app para Android, ver un anuncio puede otorgar una cantidad determinada de monedas virtuales (actualmente 100) solo cuando el proveedor de anuncios confirma a nuestro servidor que el anuncio se completó.',
            'Ganar en un juego de casino simulado no significa que vayas a ganar en juegos de apuestas con dinero real.',
          ],
        },
      ],
    },
    {
      id: 'virtual',
      title: 'Reglas de las monedas virtuales',
      summary: 'Monedas sin valor real: solo sirven para jugar dentro de la app.',
      sections: [
        { h: 'Naturaleza', p: [VIRTUAL_STATEMENT.es, 'Las monedas solo sirven para jugar dentro de Carta Casino. No son una cuenta de dinero, no generan intereses y no se pueden transferir a otros usuarios.'] },
        {
          h: 'Cómo se obtienen',
          p: [
            'Bonificación de bienvenida al crear una cuenta (1.000 monedas, una vez por cuenta).',
            'Préstamo del Banco: 500 monedas, como máximo una vez cada 24 horas (calculado por el servidor).',
            'Anuncio recompensado opcional (Android): 100 monedas cuando el proveedor confirma el anuncio completado; hay un límite diario.',
            'Resultados de los juegos. Las mesas de práctica (por ejemplo, el póker contra bots) usan fichas de práctica que no afectan a las monedas de tu cuenta.',
          ],
        },
        {
          h: 'Qué no se puede hacer',
          p: ['No se pueden comprar, vender, retirar, cambiar por dinero, criptomonedas, tarjetas regalo, productos o premios, ni intercambiar entre usuarios. Cualquier oferta de terceros para comprar o vender monedas de Carta Casino no está autorizada.'],
        },
        { h: 'Ajustes y pérdida', p: ['Podemos corregir saldos obtenidos por errores o abuso, siempre con registro interno. Si eliminas tu cuenta, sus monedas se eliminan y no se pueden recuperar. Las monedas de invitado se guardan solo en tu dispositivo.'] },
      ],
    },
    {
      id: 'responsible',
      title: 'Juego responsable',
      summary: 'Juega para divertirte y tómate pausas.',
      sections: [
        {
          h: 'Recomendaciones',
          p: [
            'Carta Casino es solo entretenimiento. Tómate descansos y no dejes que el juego interfiera con tus obligaciones o tu descanso.',
            'Los juegos de casino simulados no enseñan a ganar en apuestas reales y sus resultados no predicen resultados reales.',
            'Si el juego de apuestas te preocupa a ti o a alguien cercano, busca ayuda profesional o una línea de ayuda de tu país. (REVISIÓN LEGAL: añadir recursos de ayuda por región).',
          ],
        },
      ],
    },
    {
      id: 'privacy',
      title: 'Política de privacidad',
      summary: 'Qué datos se tratan, para qué, con quién y tus opciones.',
      sections: [
        { h: 'Responsable', p: [`Responsable: ${f.owner}. Contacto: ${f.contact}. Última actualización: ${LEGAL_CONFIG.updated}.`] },
        {
          h: 'Datos que tratamos',
          p: [
            'Si juegas sin cuenta, tus preferencias, monedas de invitado y progreso se guardan solo en tu dispositivo (almacenamiento local del navegador o de la app).',
            'Si usas funciones en línea sin cuenta (salas en línea, tragamonedas premium), nuestro servidor crea un identificador anónimo para esa sesión.',
            'Si creas una cuenta: correo electrónico y contraseña (la contraseña la guarda el servicio de autenticación de forma cifrada), o los datos que Google o Discord nos envían si inicias sesión con ellos (normalmente correo, nombre, imagen de perfil e identificador del proveedor).',
            'Datos de juego de la cuenta: nombre de usuario, saldo de monedas, historial de partidas (juego, apuesta, resultado, fecha), préstamos, recompensas por anuncios, salas en línea en curso, última actividad y, si corresponde, sanciones y registros de moderación.',
            'Datos técnicos: al conectarte, nuestro proveedor de servidor (Supabase, región us-east-1, EE. UU.) y el alojamiento web (GitHub Pages) reciben tu dirección IP y datos del navegador o dispositivo en sus registros técnicos.',
          ],
        },
        {
          h: 'Publicidad (solo app de Android)',
          p: [
            'La app para Android muestra anuncios recompensados de Google AdMob solo cuando tú lo pides. El SDK de Google puede recopilar el identificador de publicidad del dispositivo, la dirección IP, información del dispositivo y de la app, y datos de interacción con los anuncios, según las políticas de Google.',
            'Donde la ley lo exige, se muestra el formulario de consentimiento de Google antes de pedir anuncios.',
            'Para verificar la recompensa, enviamos a Google nuestro identificador interno de tu cuenta, y Google nos lo devuelve en una confirmación firmada. Más información: https://policies.google.com/technologies/partner-sites',
          ],
        },
        { h: 'Qué no recopilamos', p: ['La app no solicita ubicación GPS, contactos, fotos, cámara ni micrófono, y no procesa pagos (no hay compras). El código de la app no incluye SDK de analítica ni de informes de fallos. Otros datos que puedan recopilar Google Play o el sistema operativo quedan fuera de esta app y se rigen por sus propias políticas.'] },
        {
          h: 'Para qué',
          p: ['Crear y mantener tu cuenta, guardar tu saldo e historial, hacer funcionar las partidas en línea, entregar recompensas y préstamos, prevenir trampas y abusos (moderación), mostrar anuncios solicitados (Android) y mantener la seguridad del servicio.'],
        },
        {
          h: 'Con quién se comparten',
          p: [
            'Proveedores que prestan el servicio: Supabase (servidor, base de datos y autenticación), GitHub (alojamiento web y descargas de la app), Google (AdMob en Android; inicio de sesión con Google si lo eliges), Discord (si inicias sesión con Discord) y Cloudflare (Turnstile, la verificación anti-bots al registrarte, iniciar sesión o crear una sesión de invitado en línea, cuando está activada; recibe tu IP y datos del navegador para distinguir personas de bots). Cada uno trata los datos según su propia política.',
            'El equipo de moderación de Carta Casino puede ver el correo, nombre de usuario, saldo e historial de una cuenta para atender incidencias y prevenir abusos; sus acciones quedan registradas.',
            'No vendemos tus datos. Otros jugadores solo ven tu nombre de usuario en las salas en línea.',
          ],
        },
        { h: 'Cookies e identificadores', p: ['La app guarda datos en el almacenamiento local del dispositivo (preferencias, progreso, monedas de invitado y la sesión). No usamos cookies propias de publicidad o analítica. Las páginas de inicio de sesión de Google o Discord pueden usar sus propias cookies.'] },
        { h: 'Seguridad', p: ['Las comunicaciones usan HTTPS. Las monedas, recompensas, roles y sanciones las decide el servidor, no el dispositivo. Ningún sistema es totalmente seguro.'] },
        {
          h: 'Conservación',
          p: [
            'Los datos de la cuenta se conservan mientras la cuenta exista. Al eliminarla se borran la cuenta y sus datos asociados; se conserva un registro interno mínimo de la eliminación y de acciones de moderación (identificadores y motivos).',
            'Los identificadores anónimos de invitado no tienen, por ahora, un plazo de borrado automático definido. (REVISIÓN LEGAL: definir plazos de conservación).',
          ],
        },
        { h: 'Eliminar tu cuenta', p: ['Desde la app o la web: Cuenta → Eliminar cuenta. Los datos del dispositivo se borran desde Ajustes. También puedes pedirlo escribiendo al contacto indicado.'] },
        {
          h: 'Tus derechos',
          p: [`Puedes consultar tus datos en la app, cambiar tu nombre de usuario y eliminar tu cuenta. Para otras solicitudes, escribe a ${f.contact}. Los derechos concretos dependen de tu país o estado. (REVISIÓN LEGAL: derechos por región, p. ej. leyes estatales de EE. UU., Puerto Rico y Latinoamérica).`],
        },
        { h: 'Menores', p: [`Carta Casino contiene juegos de casino simulados y no está dirigida a menores. Edad mínima: ${f.age}. (REVISIÓN LEGAL).`] },
        { h: 'Cambios', p: ['Si cambiamos esta política, actualizaremos la fecha de arriba y, si el cambio es importante, lo avisaremos en la app.'] },
      ],
    },
    {
      id: 'terms',
      title: 'Términos del servicio',
      summary: 'Reglas de uso de Carta Casino.',
      sections: [
        { h: 'El servicio', p: ['Carta Casino es un servicio de entretenimiento con juegos de casino simulados y juegos de cartas y mesa. No es un servicio de apuestas con dinero real.', 'Estos términos son un borrador técnico y requieren REVISIÓN LEGAL antes de publicarse.'] },
        { h: 'Monedas virtuales', p: [VIRTUAL_STATEMENT.es, 'No existe retiro ni canje de monedas. Podemos ajustar saldos por errores o abusos.'] },
        { h: 'Cuentas', p: ['Eres responsable de tu cuenta y de mantener segura tu contraseña. El nombre de usuario no debe ser ofensivo ni suplantar a otras personas. Puedes eliminar tu cuenta cuando quieras.'] },
        {
          h: 'Uso prohibido',
          p: ['Está prohibido hacer trampas, usar bots o automatización, explotar errores, manipular el cliente o las comunicaciones, crear cuentas para acumular bonificaciones, comerciar con monedas o cuentas, y acosar a otros jugadores.'],
        },
        { h: 'Suspensión', p: ['Podemos suspender o cerrar cuentas que incumplan estos términos. Las sanciones quedan registradas con su motivo.'] },
        { h: 'Propiedad intelectual', p: ['El diseño, gráficos, sonidos y código de Carta Casino pertenecen a su responsable o a sus licenciantes. No se usan marcas ni materiales de casinos reales.'] },
        { h: 'Cambios y disponibilidad', p: ['Podemos cambiar, pausar o retirar juegos o funciones. El servicio se ofrece "tal cual", sin garantía de disponibilidad continua. (REVISIÓN LEGAL: limitación de responsabilidad y ley aplicable).'] },
        { h: 'Contacto', p: [`${f.owner} · ${f.contact}`] },
      ],
    },
    {
      id: 'deletion',
      title: 'Eliminar cuenta y datos',
      summary: 'Cómo borrar tu cuenta y tus datos.',
      sections: [
        { h: 'Desde la app o la web', p: ['Abre Cuenta → Eliminar cuenta, escribe la palabra de confirmación y confirma. La cuenta y sus datos asociados (nombre de usuario, monedas, historial, préstamos, recompensas) se borran de forma permanente.', 'Web: https://siiknotic.github.io/Unopro/ → Cuenta → Eliminar cuenta.'] },
        { h: 'Qué se conserva', p: ['Un registro interno mínimo de la eliminación y de acciones de moderación (identificadores, fecha y motivo), necesario para la seguridad del servicio.'] },
        { h: 'Datos del dispositivo', p: ['Preferencias, progreso y monedas de invitado se guardan en tu dispositivo: bórralos en Ajustes → Restablecer todos los datos, o desinstalando la app.'] },
      ],
    },
    {
      id: 'contact',
      title: 'Contacto',
      summary: 'Cómo comunicarte con nosotros.',
      sections: [{ h: 'Contacto', p: [`Responsable: ${f.owner}`, `Correo: ${f.contact}`] }],
    },
  ];
}

function en(): LegalDoc[] {
  const f = fill('en');
  return [
    {
      id: 'notice',
      title: 'Important information',
      summary: 'Carta Casino is an entertainment game with simulated casino games.',
      sections: [
        {
          h: 'What Carta Casino is',
          p: [
            'Carta Casino is an entertainment game with simulated casino games (poker, blackjack, roulette, slots) and other card and table games.',
            'Coins and chips are virtual. They do not represent real money, cannot be turned into money, cannot be withdrawn and offer no prizes of real value.',
            'The app does not offer real-money gambling. Coins cannot be purchased.',
            VIRTUAL_STATEMENT.en,
          ],
        },
        {
          h: 'Rewarded ads',
          p: [
            'Rewarded ads are optional. In the Android app, watching an ad may grant a set amount of virtual coins (currently 100) only when the ad provider confirms to our server that the ad was completed.',
            'Winning at a simulated casino game does not mean you would win at real-money gambling.',
          ],
        },
      ],
    },
    {
      id: 'virtual',
      title: 'Virtual currency rules',
      summary: 'Coins with no real value: they are only for playing in the app.',
      sections: [
        { h: 'Nature', p: [VIRTUAL_STATEMENT.en, 'Coins are only for playing inside Carta Casino. They are not a money account, earn no interest and cannot be transferred to other users.'] },
        {
          h: 'How you get them',
          p: [
            'Welcome bonus when you create an account (1,000 coins, once per account).',
            'Bank loan: 500 coins, at most once every 24 hours (timed by the server).',
            'Optional rewarded ad (Android): 100 coins when the provider confirms the completed ad; there is a daily limit.',
            'Game results. Practice tables (for example poker against bots) use practice chips that don\'t affect your account coins.',
          ],
        },
        { h: 'What you cannot do', p: ['Coins cannot be bought, sold, withdrawn, exchanged for money, crypto, gift cards, products or prizes, or traded between users. Any third-party offer to buy or sell Carta Casino coins is not authorised.'] },
        { h: 'Adjustments and loss', p: ['We may correct balances obtained through bugs or abuse, always with an internal record. If you delete your account, its coins are deleted and cannot be recovered. Guest coins are stored only on your device.'] },
      ],
    },
    {
      id: 'responsible',
      title: 'Responsible play',
      summary: 'Play for fun and take breaks.',
      sections: [
        {
          h: 'Recommendations',
          p: [
            'Carta Casino is only entertainment. Take breaks and don\'t let play get in the way of your obligations or your rest.',
            'Simulated casino games don\'t teach you to win at real gambling, and their results don\'t predict real ones.',
            'If gambling worries you or someone close to you, seek professional help or a helpline in your country. (LEGAL REVIEW: add help resources per region).',
          ],
        },
      ],
    },
    {
      id: 'privacy',
      title: 'Privacy policy',
      summary: 'What data is processed, why, with whom, and your choices.',
      sections: [
        { h: 'Controller', p: [`Controller: ${f.owner}. Contact: ${f.contact}. Last updated: ${LEGAL_CONFIG.updated}.`] },
        {
          h: 'Data we process',
          p: [
            'If you play without an account, your preferences, guest coins and progress are stored only on your device (browser or app local storage).',
            'If you use online features without an account (online rooms, premium slots), our server creates an anonymous identifier for that session.',
            'If you create an account: email and password (the password is stored hashed by the authentication service), or the data Google or Discord send us if you sign in with them (usually email, name, profile picture and provider identifier).',
            'Account game data: username, coin balance, game history (game, stake, result, date), loans, ad rewards, online rooms in progress, last activity and, where applicable, sanctions and moderation records.',
            'Technical data: when you connect, our server provider (Supabase, region us-east-1, USA) and the web host (GitHub Pages) receive your IP address and browser or device information in their technical logs.',
          ],
        },
        {
          h: 'Advertising (Android app only)',
          p: [
            'The Android app shows Google AdMob rewarded ads only when you ask for one. Google\'s SDK may collect the device advertising ID, IP address, device and app information and ad interaction data, under Google\'s policies.',
            'Where the law requires it, Google\'s consent form is shown before ads are requested.',
            'To verify the reward we send Google our internal identifier for your account, and Google returns it to us in a signed confirmation. More: https://policies.google.com/technologies/partner-sites',
          ],
        },
        { h: 'What we don\'t collect', p: ['The app does not request GPS location, contacts, photos, camera or microphone, and does not process payments (there are no purchases). The app\'s code includes no analytics or crash-reporting SDK. Data that Google Play or the operating system may collect is outside this app and governed by their own policies.'] },
        { h: 'Why', p: ['To create and keep your account, store your balance and history, run online games, grant rewards and loans, prevent cheating and abuse (moderation), show requested ads (Android) and keep the service secure.'] },
        {
          h: 'Who we share with',
          p: [
            'Providers that run the service: Supabase (server, database and authentication), GitHub (web hosting and app downloads), Google (AdMob on Android; Google sign-in if you choose it), Discord (if you sign in with Discord) and Cloudflare (Turnstile, the anti-bot check when you sign up, sign in or start an online guest session, when enabled; it receives your IP and browser data to tell people from bots). Each processes data under its own policy.',
            'Carta Casino\'s moderation team can see an account\'s email, username, balance and history to handle issues and prevent abuse; their actions are logged.',
            'We don\'t sell your data. Other players only see your username in online rooms.',
          ],
        },
        { h: 'Cookies and identifiers', p: ['The app stores data in the device\'s local storage (preferences, progress, guest coins and the session). We use no advertising or analytics cookies of our own. Google or Discord sign-in pages may use their own cookies.'] },
        { h: 'Security', p: ['Traffic uses HTTPS. Coins, rewards, roles and sanctions are decided by the server, not the device. No system is completely secure.'] },
        {
          h: 'Retention',
          p: [
            'Account data is kept while the account exists. Deleting it removes the account and its associated data; a minimal internal record of the deletion and of moderation actions (ids and reasons) is kept.',
            'Anonymous guest identifiers currently have no defined automatic deletion period. (LEGAL REVIEW: define retention periods).',
          ],
        },
        { h: 'Deleting your account', p: ['In the app or on the web: Account → Delete account. Device data is cleared from Settings. You can also ask by writing to the contact below.'] },
        { h: 'Your rights', p: [`You can see your data in the app, change your username and delete your account. For other requests write to ${f.contact}. Specific rights depend on your country or state. (LEGAL REVIEW: rights per region, e.g. US state laws, Puerto Rico and Latin America).`] },
        { h: 'Children', p: [`Carta Casino contains simulated casino games and is not directed at children. Minimum age: ${f.age}. (LEGAL REVIEW).`] },
        { h: 'Changes', p: ['If we change this policy we will update the date above and, for important changes, tell you in the app.'] },
      ],
    },
    {
      id: 'terms',
      title: 'Terms of service',
      summary: 'Rules for using Carta Casino.',
      sections: [
        { h: 'The service', p: ['Carta Casino is an entertainment service with simulated casino games and card and table games. It is not a real-money gambling service.', 'These terms are a technical draft and require LEGAL REVIEW before publication.'] },
        { h: 'Virtual coins', p: [VIRTUAL_STATEMENT.en, 'There is no withdrawal or redemption of coins. We may adjust balances for bugs or abuse.'] },
        { h: 'Accounts', p: ['You are responsible for your account and for keeping your password safe. Usernames must not be offensive or impersonate others. You can delete your account at any time.'] },
        { h: 'Prohibited use', p: ['Cheating, bots or automation, exploiting bugs, tampering with the client or its traffic, creating accounts to farm bonuses, trading coins or accounts, and harassing other players are prohibited.'] },
        { h: 'Suspension', p: ['We may suspend or close accounts that break these terms. Sanctions are logged with their reason.'] },
        { h: 'Intellectual property', p: ['Carta Casino\'s design, graphics, sounds and code belong to its owner or licensors. No real casino brands or materials are used.'] },
        { h: 'Changes and availability', p: ['We may change, pause or remove games or features. The service is provided "as is", without a guarantee of continuous availability. (LEGAL REVIEW: limitation of liability and governing law).'] },
        { h: 'Contact', p: [`${f.owner} · ${f.contact}`] },
      ],
    },
    {
      id: 'deletion',
      title: 'Delete account and data',
      summary: 'How to delete your account and your data.',
      sections: [
        { h: 'In the app or on the web', p: ['Open Account → Delete account, type the confirmation word and confirm. The account and its associated data (username, coins, history, loans, rewards) are permanently deleted.', 'Web: https://siiknotic.github.io/Unopro/ → Account → Delete account.'] },
        { h: 'What is kept', p: ['A minimal internal record of the deletion and of moderation actions (ids, date and reason), needed for the security of the service.'] },
        { h: 'Device data', p: ['Preferences, progress and guest coins are stored on your device: clear them in Settings → Reset all data, or by uninstalling the app.'] },
      ],
    },
    {
      id: 'contact',
      title: 'Contact',
      summary: 'How to reach us.',
      sections: [{ h: 'Contact', p: [`Controller: ${f.owner}`, `Email: ${f.contact}`] }],
    },
  ];
}

export const legalDocs = (lang: LegalLang): LegalDoc[] => (lang === 'en' ? en() : es());
export const legalDoc = (lang: LegalLang, id: DocId) => legalDocs(lang).find((d) => d.id === id)!;
