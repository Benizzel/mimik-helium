<div align="center"><a name="readme-top"></a>

<img src="public/mascot.svg" width="140" height="140" alt="Mascotte de Mimik" />

# Mimik

[English](./README.md) · [Español](./README.es.md) · [Português (BR)](./README.pt-BR.md) · **Français**

**Capture n'importe quel flux dans ton navigateur et transforme-le en guide étape par étape. Pas de compte, pas de cloud, pas de tracking.**

Clique sur enregistrer, fais ce que tu as à faire, et récupère un guide soigné avec des captures annotées. Modifie, rejoue ou exporte.

<!-- SHIELD GROUP -->

[![License][license-shield]][license-link]
[![Manifest V3][mv3-shield]][mv3-link]
[![100% Local][local-shield]][local-link]
[![No Account][no-account-shield]][no-account-link]
<br/>
[![Stars][star-shield]][star-link]
[![Contributors][contributors-shield]][contributors-link]
![Last Commit][last-commit-shield]
[![Issues][issues-shield]][issues-link]

</div>

<details>
<summary><kbd>Sommaire</kbd></summary>

#### TOC

- [📺 Démo](#-démo)
- [👋 Pour commencer](#-pour-commencer)
- [✨ Fonctionnalités](#-fonctionnalités)
  - [🎬 Capture automatique](#-capture-automatique)
  - [📸 Captures annotées](#-captures-annotées)
  - [🔒 Smart Blur](#-smart-blur)
  - [🧠 Descriptions par IA (optionnel)](#-descriptions-par-ia-optionnel)
  - [▶️ Lecture Guide Me](#️-lecture-guide-me)
  - [📤 Export multi-format](#-export-multi-format)
  - [🌍 Multilingue](#-multilingue)
  - [💾 Stockage 100% local](#-stockage-100-local)
- [🤝 Contribuer](#-contribuer)
- [📜 Licence](#-licence)

<br/>

</details>

## 📺 Démo

<div align="center">
<img src="https://github.com/user-attachments/assets/9de20b45-2256-4127-8242-141cf1802f39" alt="Démo de Mimik" width="800" />
</div>

## 👋 Pour commencer

Mimik transforme n'importe quelle tâche répétitive dans le navigateur en un guide documenté et partageable en quelques secondes. Tout tourne dans ton navigateur. Pas de backend, pas de compte, pas de télémétrie, et rien ne quitte ton appareil.

Que tu documentes des outils internes, que tu rédiges des tutoriels, ou que tu formes un collègue, Mimik capture chaque clic, frappe et navigation pour que tu puisses te concentrer sur le reste.

| Navigateur | Version | Installation |
| ---------- | ------- | ------------ |
| Chrome     | [![Chrome Version][chrome-version-shield]][chrome-link]   | [Chrome Web Store][chrome-link] |
| Firefox    | [![Firefox Version][firefox-version-shield]][firefox-link] | [Firefox Add-ons][firefox-link]  |
| Edge       | [![Edge Version][edge-version-shield]][edge-link]          | [Microsoft Edge Add-ons][edge-link] |

> \[!IMPORTANT]
>
> **⭐️ Mets une étoile au repo** si Mimik te fait gagner du temps. Ça aide les autres à le découvrir.

<a href="https://github.com/westpoint-io/mimik">
  <img width="100%" alt="Mets une étoile à Mimik sur GitHub" src="https://github.com/user-attachments/assets/80d304da-a765-4bde-bf49-b1bdcb4fe804" />
</a>

<div align="right">

[![Back to top][back-to-top]](#readme-top)

</div>

## ✨ Fonctionnalités

### 🎬 Capture automatique

Tu cliques, tu tapes, tu navigues. Mimik voit tout. Chaque action utile devient une étape : clics sur boutons et liens, champs de formulaire, raccourcis clavier, presse-papiers, drag & drop, et navigations.

La fusion intelligente des événements écarte les clics rapprochés sur des éléments proches, pour garder tes guides propres. L'interception du clic se fait *avant* que la page ne change, donc rien ne se perd dans les SPA ou les rechargements complets.

<div align="right">

[![Back to top][back-to-top]](#readme-top)

</div>

### 📸 Captures annotées

Chaque étape reçoit une capture avec l'élément cliqué mis en surbrillance et zoomé. Pas besoin de rogner à la main, pas d'outil d'annotation à apprendre. Mimik trouve la partie importante de la page et la cadre pour toi.

<div align="right">

[![Back to top][back-to-top]](#readme-top)

</div>

### 🔒 Smart Blur

Mimik détecte et floute automatiquement les données sensibles dans tes captures : e-mails, numéros de téléphone, numéros de sécu, cartes bancaires, IPs, adresses MAC. Active ou désactive chaque catégorie indépendamment.

Besoin de cacher quelque chose de précis ? Le sélecteur manuel te laisse choisir n'importe quel élément du DOM et le masquer sur toutes les captures où il apparaît.

<img src="https://github.com/user-attachments/assets/968d2518-c561-4d68-92a6-3d5f569fe38a" alt="Smart Blur" width="800" />

<div align="right">

[![Back to top][back-to-top]](#readme-top)

</div>

### 🧠 Descriptions par IA (optionnel)

Apporte ta propre clé API (OpenAI ou Anthropic) et Mimik génère des descriptions naturelles comme *« Clique sur le bouton **Envoyer** pour sauvegarder »* au lieu de `Click button "Submit"`.

Les descriptions sont générées à partir d'un contexte léger du DOM (~50-100 tokens), pas des captures. Environ 15-30x moins cher que les modèles vision. Choisis la langue des descriptions (anglais, espagnol, portugais, français).

<img src="https://github.com/user-attachments/assets/3540cbd5-133f-46fd-a9b6-ffce9b4d422a" alt="Descriptions par IA" width="800" />

<div align="right">

[![Back to top][back-to-top]](#readme-top)

</div>

### ▶️ Lecture Guide Me

Rejoue n'importe quel guide en direct sur une vraie page. Mimik met en évidence l'élément suivant, suit ta progression étape par étape, et avance tout seul au fur et à mesure. Parfait pour former un collègue ou se guider soi-même dans un process.

<img src="https://github.com/user-attachments/assets/56ffca1d-5074-491f-8571-dd70782d4b05" alt="Lecture Guide Me" width="800" />

<div align="right">

[![Back to top][back-to-top]](#readme-top)

</div>

### 📤 Export multi-format

Partage tes guides dans le format qui colle à ton flux :

- **HTML** : autonome, à partager partout, images intégrées en base64
- **PDF** : prêt à imprimer, A4 portrait avec sauts de page auto
- **Markdown** : à coller dans Notion, GitHub, docs internes, wikis

Tous les exports sont générés côté client. Rien ne passe par un serveur.

<img src="https://github.com/user-attachments/assets/e7584527-7d68-4f3f-9261-8380ee08dfb4" alt="Export multi-format" width="800" />

<div align="right">

[![Back to top][back-to-top]](#readme-top)

</div>

### 🌍 Multilingue

Interface disponible en anglais, espagnol, portugais brésilien et français. La langue des descriptions IA se configure séparément, donc tu peux lancer Mimik en anglais et générer les guides en français, ou n'importe quelle combinaison.

<div align="right">

[![Back to top][back-to-top]](#readme-top)

</div>

### 💾 Stockage 100% local

Tes guides, étapes et captures restent sur ton appareil. Pas de backend, pas de compte, pas de télémétrie. Tes clés API (si tu en utilises) ne quittent jamais le navigateur. Elles sont stockées localement et envoyées directement au fournisseur d'IA que tu as choisi.

<div align="right">

[![Back to top][back-to-top]](#readme-top)

</div>

## 🤝 Contribuer

Toute contribution est la bienvenue : rapports de bugs, idées, PR et traductions.

Voir [CONTRIBUTING.md](./CONTRIBUTING.md) pour le setup dev, la structure du projet, et les règles pour contribuer.

<div align="right">

[![Back to top][back-to-top]](#readme-top)

</div>

## 📜 Licence

MIT © [Westpoint](https://github.com/westpoint-io). Voir [LICENSE](./LICENSE) pour les détails.

<div align="right">

[![Back to top][back-to-top]](#readme-top)

</div>

<!-- LINK GROUP -->

[back-to-top]: https://img.shields.io/badge/-BACK_TO_TOP-1E1B4B?style=flat-square

[license-shield]: https://img.shields.io/badge/license-MIT-4F46E5?style=flat-square&labelColor=1E1B4B
[license-link]: ./LICENSE

[mv3-shield]: https://img.shields.io/badge/manifest-v3-3730A3?style=flat-square&labelColor=1E1B4B
[mv3-link]: https://developer.chrome.com/docs/extensions/mv3/intro/

[local-shield]: https://img.shields.io/badge/storage-100%25%20local-4F46E5?style=flat-square&labelColor=1E1B4B
[local-link]: #-stockage-100-local

[no-account-shield]: https://img.shields.io/badge/account-not%20required-4F46E5?style=flat-square&labelColor=1E1B4B
[no-account-link]: #-stockage-100-local

[star-shield]: https://img.shields.io/github/stars/westpoint-io/mimik?style=flat-square&label=stars&color=4F46E5&labelColor=1E1B4B
[star-link]: https://github.com/westpoint-io/mimik/stargazers

[contributors-shield]: https://img.shields.io/github/contributors/westpoint-io/mimik?style=flat-square&labelColor=1E1B4B
[contributors-link]: https://github.com/westpoint-io/mimik/graphs/contributors

[last-commit-shield]: https://img.shields.io/github/last-commit/westpoint-io/mimik?style=flat-square&label=commit&labelColor=1E1B4B

[issues-shield]: https://img.shields.io/github/issues/westpoint-io/mimik?style=flat-square&labelColor=1E1B4B
[issues-link]: https://github.com/westpoint-io/mimik/issues

[chrome-version-shield]: https://img.shields.io/chrome-web-store/v/jmfohdaflahliammccpiadmkcibohgha?label=Chrome%20Version&style=flat-square&logo=googlechrome&logoColor=C7D2FE&color=4F46E5&labelColor=1E1B4B
[chrome-link]: https://chromewebstore.google.com/detail/mimik/jmfohdaflahliammccpiadmkcibohgha
[firefox-version-shield]: https://img.shields.io/amo/v/mimik?label=Firefox%20Version&style=flat-square&logo=firefoxbrowser&logoColor=C7D2FE&color=4F46E5&labelColor=1E1B4B
[firefox-link]: https://addons.mozilla.org/en-US/firefox/addon/mimik/
[edge-version-shield]: https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fmicrosoftedge.microsoft.com%2Faddons%2Fgetproductdetailsbycrxid%2Fhgjemhfoffebbollleajkpefblppleai&query=%24.version&label=Edge%20Version&style=flat-square&logo=microsoftedge&logoColor=C7D2FE&color=4F46E5&labelColor=1E1B4B
[edge-link]: https://microsoftedge.microsoft.com/addons/detail/hgjemhfoffebbollleajkpefblppleai
