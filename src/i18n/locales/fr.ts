/**
 * Français.
 *
 * Ne renommez ni ne supprimez aucune clé — la référence est `zh-Hans.ts` ;
 * lancez `npm run typecheck` et il vous dira exactement ce qui manque.
 */
import type { Messages } from '../types';

export const fr: Messages = {
  /* ---------------- générique ---------------- */
  'common.unknownError': 'Erreur inconnue',

  /* ---------------- ① barre du haut ---------------- */
  'camera.flash.label': 'FLASH',
  // Descriptions d'état (pas d'action) : la même chaîne sert d'étiquette a11y au
  // bouton et de bandeau transitoire sur le viseur — les deux ne doivent pas diverger.
  'camera.flash.state.off': 'Flash · Éteint',
  'camera.flash.state.on': 'Flash · Allumé',
  'camera.flash.state.auto': 'Flash · Auto',
  'camera.flip.a11y': 'Basculer entre la caméra avant et arrière',
  'camera.flip.label': 'INVERSER',
  'camera.settings.a11y': 'Ouvrir les réglages',
  'camera.settings.label': 'RÉGL.',

  /* ---------------- ③ commandes du bas ---------------- */
  'camera.preset.head': 'PRÉRÉGLAGE',
  'camera.preset.a11y': 'Préréglage actuel {name}, toucher pour changer',
  'camera.preset.hint': '{index}/{total} · changer',
  'camera.frame.hint': 'Balayez le viseur',
  'camera.frame.label': 'CADRE',
  'camera.frame.next': 'Cadre suivant',
  'camera.frame.prev': 'Cadre précédent',
  'camera.frame.switcher': 'Changement de cadre',
  'camera.frame.switcherHint': 'Balayez vers la gauche ou la droite pour changer de cadre',
  'camera.shutter.a11y': 'Prendre une photo',
  'camera.shutter.busy': 'Développement',

  /* ---------------- filmothèque (bouton pellicule en bas à droite) ---------------- */
  // Le titre du panneau = la plaque anglaise imprimée (jamais traduite) + un mot
  // dans la langue courante, séparés par ' · '. La plaque est une gravure du
  // boîtier ; le mot qui suit s'adresse au photographe.
  'film.drawer.title': 'SELECT FILM STOCK · FILMOTHÈQUE',
  'film.drawer.a11y': 'Filmothèque, choisir un préréglage de pellicule',
  'film.drawer.close': 'Terminé',
  'film.drawer.hint':
    'Touchez une pellicule pour la choisir · le bouton en bas à droite change à tout moment',
  'film.card.a11y': '{name}, {description}',
  'film.card.selected': 'Sélectionné',
  'film.intensity.title': 'PRESET INTENSITY · Intensité',
  'film.intensity.hint': 'Une intensité pour toute la pellicule · AUTO laisse le moteur de scène décider',
  'film.intensity.a11y': 'Intensité du préréglage, actuelle : {label}',
  'film.intensity.auto.hint': 'S’adapte à la scène (70 %–145 %)',
  'film.stockMode.auto': 'AUTO Pellicule intelligente',
  'film.stockMode.auto.hint': 'Choisit la pellicule et l’intensité selon la scène',
  'film.stockMode.manual.hint': 'Choisir une pellicule manuellement',
  'film.stockMode.a11y': 'Pellicule intelligente auto, {state}',

  /* ---------------- noms des cadres (barre du haut) ----------------
     Restez court : la barre du haut est une seule ligne en 10pt monospace,
     un nom trop long pousse le nom du préréglage hors de l'écran. */
  'frame.polaroid600': 'INSTANTANÉ',
  'frame.instaxMini': 'MINI',
  'frame.neg135': '135',
  'frame.slideMount': 'DIAPO',
  'frame.badge.a11y': 'Cadre {name}, photo {count}',
  'frame.variant.a11y': 'Style de cadre {name}',
  'drawer.frame.title': 'Cadre',
  'drawer.frame.hint': 'Balayez pour changer de style',

  /* ---------------- ② rail de zoom sur le viseur ---------------- */
  'zoom.a11y': 'Zoom {percent} %, touchez une focale pour changer',
  'zoom.label': 'ZOOM',
  'zoom.role.ultraWide': 'ultra grand-angle',
  'zoom.role.wide': 'standard',
  'zoom.role.tele': 'téléobjectif',
  'zoom.stop.a11y': 'Passer à {label}',
  'zoom.stop.digital': 'zoom numérique',
  'camera.gallery.a11y': 'Ouvrir l’album de l’app',
  'camera.gallery.label': 'ALBUM',
  'gallery.title': 'ALBUM',
  'gallery.close': 'Terminé',
  'gallery.empty': 'Aucune photo',
  'gallery.emptyHint': 'Vos prises apparaissent ici — inutile d’ouvrir Photos.',
  'gallery.photo': 'Photo {index}, {date}',
  'gallery.delete': 'Supprimer cette photo',
  'gallery.cancel': 'Annuler',
  'gallery.lightbox.a11y': 'Photo {index}, toucher pour fermer',
  'gallery.share': 'Partager',
  'gallery.shareFailed': 'Échec du partage : {message}',
  'gallery.saved': 'Enregistré dans « {album} »',
  // Le nom de l’album est identique dans les cinq langues : l’utilisateur doit
  // retrouver un seul et même album dans l’app Photos.
  'album.name': 'RETRO CAM',
  'camera.focus.a11y': 'Touchez l’image pour faire le point',

  /* ---------------- ③.5 grain ---------------- */
  'grain.a11y': 'Intensité du grain {label}',
  'grain.label': 'GRAIN',
  'grain.level.off': 'Aucun',
  'grain.level.light': 'Léger',
  'grain.level.std': 'Standard',
  'grain.level.heavy': 'Fort',
  'grain.level.max': 'Extrême',
  'grain.note': 'Ajoute un cran de densité par-dessus le grain propre à la pellicule.',

  /* ---------------- ④ bandeau LCD ---------------- */
  'lcd.date.off': 'DATE · AUCUNE',
  'lcd.date.on': 'DATE {format} · ANCRE {anchor}',
  'lcd.font.custom': 'perso',
  'lcd.font.mono': 'mono',
  // Les deux versions courtes sont réservées au LCD : c'est une seule ligne
  // monospace, donc la phrase complète de l'écran de réglages y serait tronquée.
  'lcd.location.denied': 'POSITION · REFUSÉE',
  'lcd.location.off': 'POSITION · AUCUNE',
  'lcd.location.on': 'POSITION {value}',
  'lcd.location.servicesOff': 'POSITION · SERVICE OFF',
  'lcd.params': 'GRAIN {code} {grain} · VIGNETTE {vignette} · FUITE {leak} · POLICE {font}',

  /* ---------------- bandeau d'échec d'enregistrement ---------------- */
  'banner.dismiss': 'Compris',
  'banner.openSettings': 'Ouvrir les réglages',

  /* ---------------- autorisations ---------------- */
  'perm.camera.allow': "Autoriser l'appareil photo",
  'perm.camera.hint':
    "iOS : Réglages → Confidentialité et sécurité → Appareil photo. Android : Réglages → Applications → Autorisations. Revenez ensuite dans l'app et touchez « Vérifier à nouveau ».",
  'perm.camera.message':
    "Cette app ne fait que cadrer et développer sur votre appareil. Aucune photo n'est jamais envoyée.",
  'perm.camera.openSettings': 'Ouvrir les réglages système',
  'perm.camera.recheck': 'Vérifier à nouveau',
  'perm.camera.title': "Accès à l'appareil photo requis",
  'perm.mount.hint':
    "Si ça échoue toujours : fermez complètement l'app (balayez-la vers le haut) puis rouvrez-la ; sinon, redémarrez le téléphone. Une autre app qui utilise la caméra (enregistrement, appel vidéo) peut aussi la bloquer.",
  'perm.mount.retry': 'Réessayer',
  'perm.mount.title': "L'appareil photo n'a pas démarré",

  /* ---------------- superposition de développement ---------------- */
  'develop.done.saved': "Enregistré dans l'album",
  'develop.done.unsaved': 'Développé (non enregistré)',
  'develop.error.title': 'Développement échoué',
  'develop.queue.count': 'File {count}',
  'develop.stage.capturing': 'Exposition et développement',
  'develop.stage.grading': 'Étalonnage du film',
  'develop.stage.normalizing': 'Préparation du négatif',
  'develop.stage.saving': "Enregistrement dans l'album",
  'develop.tapToContinue': "Touchez l'écran pour continuer",
  'develop.auto.badge': 'Sélection AUTO : {badge}',

  /* ---------------- erreurs ---------------- */
  'error.noPhoto': "L'appareil photo n'a renvoyé aucune photo. Réessayez.",
  'error.filmRender': 'Échec du développement (pipeline LUT). La photo n’a pas été enregistrée. Réessayez.',
  'save.denied.retry':
    "Pas d'autorisation d'écriture dans l'album. Touchez à nouveau Enregistrer et choisissez « Autoriser ».",
  'save.denied.settings':
    "L'accès à l'album a été refusé définitivement. Ouvrez Réglages → Confidentialité et sécurité → Photos et autorisez-le.",
  'save.unsupported':
    "Cette version d'expo-media-library n'a pas d'API d'enregistrement. Mettez à jour le SDK Expo.",

  /* ---------------- écran de réglages ---------------- */
  'settings.close': 'Terminé',
  'settings.footer':
    "Les changements s'appliquent immédiatement et sont conservés à la prochaine ouverture.",
  'settings.grain.title': 'Grain',
  'settings.grain.a11y': 'Intensité du grain, actuellement {level}',
  'settings.language.head': 'LANGUE',
  'settings.language.system': 'Suivre le système',
  'settings.location.head': 'FILIGRANE DE POSITION',
  'settings.location.hint':
    "Une fois activé, une ligne de position est gravée en bas à gauche de la photo (blanc papier, sur la même ligne de base que la date ambrée à droite). Les coordonnées sont calculées entièrement hors ligne ; les noms de lieu passent par le géocodage inverse du système (Apple sur iOS, Google sur Android) et seule cette étape utilise le réseau — la position n'est écrite que dans votre photo, l'app ne téléverse jamais rien.",
  'settings.location.off': 'Désactivé',
  'settings.location.place': 'Nom du lieu',
  'settings.location.coords': 'Coordonnées',
  'settings.locationMode.a11y': 'Filigrane de position : {label}',
  'settings.locale.a11y': 'Langue : {label}',
  'settings.placeDetail.title': 'Niveau de détail',
  'settings.placeDetail.a11y': 'Niveau de détail : {label}',
  'settings.placeDetail.archive': 'Compact (ville · code)',
  'settings.placeDetail.full': 'Complet (administratif)',
  'settings.placeDetail.note': 'Taïwan, Hong Kong et Macao sont préfixés par « Chine ».',
  'settings.subtitle': 'RÉGLAGES',
  'settings.title': 'Réglages',
  'settings.watermark.title': 'Disposition du filigrane',
  'settings.quality.title': "Qualité d'image",
  'settings.quality.a11y': "Qualité d'image : {label}",
  'settings.quality.standard': 'Standard',
  'settings.quality.high': 'Élevée',
  'settings.quality.max': 'Maximale',
  'settings.quality.note':
    'Fixe le grand côté du tirage. Plus grand = plus net, et plus gourmand en mémoire.',
  'settings.quality.capNote':
    'Grand côté {longEdge}px. Un vrai 48MP demande un module caméra natif — ce réglage ne fixe que la taille du tirage.',

  'settings.watermark.a11y': 'Disposition du filigrane : {label}',
  'settings.watermark.split': 'Lieu à gauche · date à droite',
  'settings.watermark.stacked': 'Lieu au-dessus · date en dessous',
  'settings.watermark.centered': 'Une ligne · centré',
  'settings.watermark.dateOnly': 'Date seule',

  'settings.watermarkZone': 'Position verticale du filigrane',
  'settings.watermarkZone.a11y': 'Position verticale du filigrane : {label}',
  'settings.watermarkZone.auto': 'Suivre le cadre',
  'settings.watermarkZone.paper': 'Sur la marge du papier',
  'settings.watermarkZone.photoTop': 'Haut de l’image',
  'settings.watermarkZone.photoBottom': 'Bas de l’image',
  'settings.watermarkAlign': 'Alignement horizontal',
  'settings.watermarkAlign.a11y': 'Alignement horizontal : {label}',
  'settings.watermarkAlign.auto': 'Suivre la disposition',
  'settings.watermarkAlign.left': 'À gauche',
  'settings.watermarkAlign.center': 'Centré',
  'settings.watermarkAlign.right': 'À droite',
  'settings.adaptiveGrade': 'Étalonnage adaptatif',
  'settings.adaptiveGrade.a11y': 'Étalonnage adaptatif : {label}',
  'settings.adaptiveGrade.on': 'Activé',
  'settings.adaptiveGrade.off': 'Désactivé',
  'settings.adaptiveGrade.hint':
    "Ajuste le développement d’après la luminosité, le contraste et la dominante de la photo. Désactivé, le développement reste celui du preset.",

  /* ---------------- localisation ---------------- */
  'location.denied':
    "L'autorisation de localisation a été refusée. Ouvrez Réglages → Confidentialité et sécurité → Service de localisation et autorisez-la.",
  'location.failed': 'Position indisponible',
  'location.locating': 'Localisation en cours',
  'location.servicesOff': 'Le « Service de localisation » du système est désactivé.',
  /* ---------------- importer depuis la photothèque ---------------- */
  'gallery.import': 'Importer',
  'gallery.import.a11y': 'Importer des photos de la photothèque et les redévelopper',
  'gallery.import.busy': 'Développement…',
  'gallery.import.denied':
    "Accès à la photothèque refusé. Ouvrez Réglages → Confidentialité et sécurité → Photos et autorisez-le.",
  'gallery.import.failed': "Échec de l'import : {message}",
  'gallery.import.noExif': "L'original n'a pas de date de prise de vue : daté d'aujourd'hui.",

  /* ---------------- bande négative ---------------- */
  'gallery.mode.strip': 'Bande',
  'gallery.mode.grid': 'Grille',
  'gallery.mode.a11y': "Affichage de l'album : {label}",
  'gallery.strip.count': '{count} vues',

  /* ---------------- export de la bande ---------------- */
  'gallery.export.entry': 'Exporter la bande',
  'gallery.export.a11y': 'Assembler les {count} vues sélectionnées en une seule affiche',
  'gallery.export.hint': 'encore {count}',
  'gallery.export.busy': 'Assemblage…',
  'gallery.export.saved': "Bande enregistrée dans l'album",
  'gallery.export.failed': "Échec de l'export : {message}",

  /* ---------------- supprimer une vue ---------------- */
  'gallery.delete.a11y': 'Supprimer cette vue',
  'gallery.delete.title': 'Supprimer cette vue ?',
  'gallery.delete.message': 'La copie locale part avec. Action irréversible.',
  'gallery.delete.cancel': 'Annuler',
  'gallery.delete.confirm': 'Supprimer',
  'gallery.deleted': 'Supprimé',

  // ---- v1.4.0：取景器极简重构新增 ----
  'settings.geoLocale.title': 'Langue des lieux',
  'settings.geoLocale.a11y': 'Langue des lieux, actuellement {label}',
  'settings.geoLocale.auto': 'Suivre l\'interface',
  'settings.geoLocale.zhHans': '简体中文',
  'settings.geoLocale.zhHant': '繁體中文',
  'settings.geoLocale.ja': '日本語',
  'settings.geoLocale.en': 'English',
  'settings.geoLocale.note': 'N\'affecte que le lieu imprimé sur la photo, pas l\'interface',
  'camera.bar.temp': 'Tempé.',
  'camera.bar.focal': 'Focale',
  'camera.bar.ev': 'IL',
  'camera.bar.temp.a11y':
    'Température de couleur, actuellement {label}. Appui long et glissement pour régler, touchez pour réinitialiser',
  'camera.bar.focal.a11y':
    'Focale {label}. Appui long et glissement pour régler, touchez pour ouvrir les focales',
  'camera.bar.ev.a11y':
    'Correction d\'exposition {value}. Appui long et glissement pour régler, touchez pour réinitialiser',
  'camera.bar.ev.hint': 'Balayez vers le haut ou le bas pour régler l\'exposition',
  'camera.bar.intensity': 'INT',
  'camera.bar.intensity.a11y': 'Intensité du préréglage {label}, appuyez pour ouvrir les niveaux',
  'camera.tool.import': 'Importer',
  'camera.tool.double': 'Double expo',
  'camera.tool.timer': 'Retard',
  'camera.tool.flash': 'Flash',
  'camera.tool.flip': 'Pivoter',
  'camera.tool.preview': 'Aperçu',
  'camera.tool.preview.on': 'Activé',
  'camera.tool.preview.off': 'Désactivé',
  'camera.tool.preview.a11y': 'Aperçu du cadre en direct, {state}',
  'camera.tool.double.on': 'Double exposition active',
  'camera.tool.double.hint': 'Déclenchez encore pour superposer deux vues',
  'camera.tool.timer.off': 'Off',
  'camera.tool.timer.3': '3 s',
  'camera.tool.timer.10': '10 s',
  'camera.timer.counting': 'Prise dans {seconds} s',
  'camera.focus.hint': 'Touchez pour faire le point',
  'camera.exposure.a11y': 'Curseur d\'exposition, balayez vers le haut ou le bas',
  'camera.frame.slot2': 'Prenez la deuxième vue',
  'frame.fp100c': 'Pelable',
  'camera.thumb.a11y': 'Ouvrir l\'album',
  /* ---------------- v1.8.0：相框改成三大暗房卡纸材质 ---------------- */
  'frame.variant.archival': 'Blanc archive',
  'frame.variant.baryta': 'Baryta chaud',
  'frame.variant.obsidian': 'Noir obsidienne',
  /* ---------------- v1.8.1 : plein cadre sans bordure (00 NO FRAME) ---------------- */
  'frame.noFrame': 'Sans cadre',
  // Chiffres du ratio uniquement — voir le commentaire de la section zh-Hans pour la
  // raison (le créneau 3:2 est figé sur un cadre portrait 2:3).
  'frame.noFrame.aspect11': 'Cadre 1:1',
  'frame.noFrame.aspect34': 'Cadre 3:4',
  'frame.noFrame.aspect32': 'Cadre 3:2',
  'settings.noFrame.title': 'Format sans cadre',
  'settings.noFrame.a11y': 'Format sans cadre, actuellement {label}',
  'settings.noFrame.hint':
    "Utilisé uniquement avec « Sans cadre (00) » : sans papier pour fixer la forme, la photo remplit le cadre à ce ratio. Le créneau 3:2 donne un cadre portrait 2:3 (plus haut que 3:4), pas un paysage — cette valeur est figée par les scripts de contrôle du dépôt.",

  /* ---------------- v1.8.0：日期烙印引擎（13 格式 × 5 字形 × 8 机位 × 5 发光色） ---------------- */
  'settings.dateEngine.title': 'Empreinte de date',
  'settings.dateEngine.hint': 'La taille est verrouillée sur un canevas de référence de 1440 px : la hauteur en pixels ne varie jamais. Le mois et le jour restent en anglais, comme sur un vrai dos de boîtier.',
  'settings.dateEngine.a11y.format': 'Format de date, {label}',
  'settings.dateEngine.a11y.glyph': 'Glyphe de date, {label}',
  'settings.dateEngine.a11y.spot': 'Position de la date, {label}',
  'settings.dateEngine.a11y.glow': 'Lueur de la date, {label}',
  'settings.dateEngine.format.MM_DD_YY': '10  17  \'26',
  'settings.dateEngine.format.YY_MM_DD': '26 10 17',
  'settings.dateEngine.format.DD_MM_YY': '17 10 26',
  'settings.dateEngine.format.DAY_HH_MM': '17  01:39',
  'settings.dateEngine.format.YY_MM_DD_TIME': '26 10 17 01:39',
  'settings.dateEngine.format.YYYY_DOT_MM_DD': '2026.10.17',
  'settings.dateEngine.format.YYYY_SLASH_TIME': '2026/10/17 01:39',
  'settings.dateEngine.format.ENG_MMM_DD_YY': 'OCT 17 \'26',
  'settings.dateEngine.format.YYYY_MM_DD_WEEK': '2026 10 17 SAT',
  'settings.dateEngine.format.CJK_KANJI': '2026年10月17日',
  'settings.dateEngine.format.EXIF_TECH': '2026:10:17 01:39:07',
  'settings.dateEngine.format.FRAME_DATE': 'OCT 17 2026',
  'settings.dateEngine.format.OFF': 'Désactivé',
  'settings.dateEngine.glyph.quartz_led': 'LED quartz',
  'settings.dateEngine.glyph.ccd_osd': 'OSD CCD',
  'settings.dateEngine.glyph.lab_inkjet': 'Jet d\'encre labo',
  'settings.dateEngine.glyph.archival_steel': 'Acier d\'archive',
  'settings.section.dateFormat': 'FORMAT DATE',
  'settings.section.dateFont': 'POLICE STAMP',
  'settings.section.datePos': 'POSITION STAMP',
  'settings.section.dateColor': 'COULEUR LED',
  'settings.section.quality': 'RÉSOLUTION',
  'settings.section.grain': 'GRAIN',
  'settings.dateEngine.spot.in_bl_v': 'Dans l\'image, en bas à gauche · vertical',
  'settings.dateEngine.spot.in_bl_h': 'Dans l\'image, en bas à gauche · horizontal',
  'settings.dateEngine.spot.in_br_h': 'Dans l\'image, en bas à droite · horizontal',
  'settings.dateEngine.spot.in_br_v': 'Dans l\'image, en bas à droite · vertical',
  'settings.dateEngine.spot.in_tr_v': 'Dans l\'image, en haut à droite · vertical',
  'settings.dateEngine.spot.in_cb_h': 'Dans l\'image, en bas au centre',
  'settings.dateEngine.spot.strip_split': 'Marge papier · séparé',
  'settings.dateEngine.spot.strip_center': 'Marge papier · centré',
  'settings.dateEngine.glow.coral_red': 'Rouge corail',
  'settings.dateEngine.glow.classic_amber': 'Ambre tungstène',
  'settings.dateEngine.glow.warm_gold': 'Or champagne',
  'settings.dateEngine.glow.ccd_green': 'Vert Y2K',
  'settings.dateEngine.glow.cyber_cyan': 'Cyan cyber',
};
