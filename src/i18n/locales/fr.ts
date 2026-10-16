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

  /* ---------------- noms des cadres (barre du haut) ----------------
     Restez court : la barre du haut est une seule ligne en 10pt monospace,
     un nom trop long pousse le nom du préréglage hors de l'écran. */
  'frame.polaroid600': 'INSTANTANÉ',
  'frame.instaxMini': 'MINI',
  'frame.neg135': '135',
  'frame.slideMount': 'DIAPO',
  'frame.badge.a11y': 'Cadre {name}, photo {count}',

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
  'develop.stage.capturing': 'Exposition et développement',
  'develop.stage.normalizing': 'Préparation du négatif',
  'develop.stage.saving': "Enregistrement dans l'album",
  'develop.tapToContinue': "Touchez l'écran pour continuer",

  /* ---------------- erreurs ---------------- */
  'error.noPhoto': "L'appareil photo n'a renvoyé aucune photo. Réessayez.",
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
  'settings.watermark.a11y': 'Disposition du filigrane : {label}',
  'settings.watermark.split': 'Lieu à gauche · date à droite',
  'settings.watermark.stacked': 'Lieu au-dessus · date en dessous',
  'settings.watermark.centered': 'Une ligne · centré',
  'settings.watermark.dateOnly': 'Date seule',

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
  'camera.tool.import': 'Importer',
  'camera.tool.double': 'Double expo',
  'camera.tool.timer': 'Retard',
  'camera.tool.flash': 'Flash',
  'camera.tool.flip': 'Pivoter',
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
};
