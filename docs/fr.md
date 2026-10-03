# Pushover

> **Nécessite Gladys 4.86 ou supérieur.**

Recevez les messages de Gladys sur votre téléphone, votre tablette ou votre
ordinateur grâce à [Pushover](https://pushover.net) : les notifications de vos
scènes, les images de vos caméras et tous les messages que Gladys vous envoie.

Pushover devient un canal de messagerie de Gladys, au même titre que Telegram :
chaque utilisateur de Gladys y relie son propre compte Pushover, et ne reçoit
que les messages qui lui sont destinés. Le canal fonctionne en envoi seul : vous
ne pouvez pas répondre à Gladys depuis Pushover.

## Prérequis

- Un compte [Pushover](https://pushover.net) pour chaque personne qui doit
  recevoir les messages.
- L'application Pushover installée et connectée sur chaque appareil qui doit
  les recevoir ([Android, iPhone, iPad, ordinateur](https://pushover.net/clients)).
  Après un essai gratuit de 30 jours, l'application s'achète une fois par
  plateforme.
- L'envoi est gratuit jusqu'à 10 000 messages par mois, pour tout le compte
  Pushover qui possède l'application créée ci-dessous.

## Configuration (administrateur)

1. Connectez-vous à [pushover.net](https://pushover.net), puis ouvrez
   [Create an Application/API Token](https://pushover.net/apps/build).
2. Donnez-lui un nom, par exemple **Gladys** : il sert de titre aux
   notifications. Vous pouvez aussi lui donner une icône, affichée avec chaque
   notification. Acceptez les conditions, puis cliquez sur **Create
   Application**.
3. Copiez le jeton affiché sous **API Token/Key** : 30 lettres et chiffres.
4. Dans Gladys, ouvrez l'écran de configuration de l'intégration Pushover,
   collez le jeton dans **Jeton d'API de l'application**, puis enregistrez.

L'état de connexion affiche alors par exemple `Connecté à Pushover : 9996
messages restants sur 10000 ce mois-ci.` ; sinon, il affiche l'un des messages
décrits dans la partie « Dépannage » ci-dessous.

## Recevoir les messages (chaque utilisateur)

Chaque utilisateur de Gladys, administrateur ou non, renseigne son propre compte
Pushover dans le bloc **Mon compte** de l'écran de configuration de
l'intégration :

| Champ                                                | Description                                                                                                                                                                                                                                                               |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Clé utilisateur**                                  | La clé affichée sous **Your User Key**, en haut de [pushover.net](https://pushover.net) une fois connecté : 30 lettres et chiffres. Une clé de [groupe Pushover](https://pushover.net/groups) fonctionne aussi : tous les membres du groupe reçoivent alors les messages. |
| **Appareils, séparés par des virgules (facultatif)** | Les noms de vos appareils Pushover qui doivent recevoir les messages, par exemple `iphone,ipad`. Leurs noms figurent sur [pushover.net](https://pushover.net). Laissez vide pour recevoir les messages sur tous vos appareils.                                            |

Cliquez sur **Enregistrer**. Pour ne plus rien recevoir, cliquez sur **Effacer
mes valeurs**.

Un utilisateur qui n'a pas renseigné sa clé ne reçoit rien sur Pushover, et
c'est normal : il continue de recevoir les messages dans la conversation Gladys.

## Envoyer des messages

Dans une scène, utilisez l'action **Envoyer un message**, ou **Envoyer une
image de caméra** pour joindre une capture de caméra à la notification.
Choisissez l'utilisateur destinataire, puis, dans **Envoyer via**, **Tous les
services configurés** ou **Pushover** seul.

Les autres messages que Gladys envoie à un utilisateur passent aussi par
Pushover dès qu'il y a renseigné sa clé.

Ce qui arrive sur votre téléphone :

- le texte du message, jusqu'à 1 024 caractères. Un texte plus long est
  raccourci et se termine par « … » ;
- l'image de la caméra, jointe à la notification. Une image envoyée sans texte
  arrive avec le texte « 📷 » ;
- le nom et l'icône de l'application Pushover créée par l'administrateur, en
  titre de la notification.

Le son et les heures calmes se règlent dans l'application Pushover elle-même.

## Dépannage

L'état de connexion de l'écran de configuration signale les problèmes qui
touchent tous les utilisateurs. Un message qui n'a pas pu être délivré est noté
dans les journaux de l'intégration (`Message not delivered: …`), avec la raison
en anglais.

**« Saisissez le jeton d'application Pushover dans les paramètres de
l'intégration. »** Renseignez **Jeton d'API de l'application** (voir
« Configuration »).

**« Le jeton d'application n'a pas le bon format : 30 lettres et chiffres,
affichés sur la page de votre application sur pushover.net. »** Le jeton saisi
n'a pas la forme d'un jeton Pushover. Copiez-le à nouveau depuis la page de
votre application, sans espace : attention à ne pas coller votre clé
utilisateur à la place.

**« Pushover a refusé le jeton d'application. Vérifiez-le dans les paramètres
de l'intégration. »** Le jeton a le bon format, mais Pushover ne le connaît pas
: application supprimée, ou jeton d'une autre application. Plus aucun message
n'est envoyé jusqu'à ce que vous enregistriez un jeton valide.

**« La limite mensuelle de messages Pushover est atteinte. Elle est remise à
zéro le 1er du mois. »** Le compte Pushover propriétaire de l'application a
envoyé ses 10 000 messages du mois, toutes applications confondues. Réduisez
le nombre de messages de vos scènes, ou achetez de la capacité
supplémentaire chez Pushover. Gladys ne sollicite plus Pushover jusqu'à la
remise à zéro.

**« Pushover est injoignable. Vérifiez l'accès à Internet de la machine
Gladys. »**, **« Pushover n'a pas répondu à temps. Réessayez plus tard. »**,
**« Pushover rencontre des difficultés (HTTP …). Réessayez plus tard. »**
Gladys n'a pas pu joindre Pushover : coupure d'Internet, ou panne de Pushover
(voir son [état](https://status.pushover.net/)). Les messages envoyés pendant ce
temps sont perdus. L'état redevient « connecté » au premier message envoyé avec
succès.

**« Réponse inattendue à la place de Pushover : vérifiez l'accès à Internet de
la machine Gladys (proxy, portail captif). »** Une autre page a répondu à la
place de Pushover : un portail captif ou un proxy filtre l'accès à Internet.

Dans les journaux de l'intégration, pour un message en particulier :

- **`The Pushover user key in "My account" does not look right`** : la clé
  utilisateur saisie dans **Mon compte** n'a pas la forme d'une clé Pushover.
  Saisissez-la à nouveau.
- **`Pushover refused the user key, or the account has no active device`** :
  la clé n'existe pas, ou aucun appareil n'est actif sur ce compte Pushover.
  Ouvrez l'application Pushover sur votre téléphone pour l'activer. La même
  clé n'est pas réessayée pendant 10 minutes ; une clé corrigée est utilisée
  tout de suite.
- **`Invalid Pushover device name(s) in "My account"`** : un nom d'appareil
  contient un caractère interdit. Un nom d'appareil fait au plus 25
  caractères : lettres, chiffres, `-` et `_`.
- **`Pushover refused the message (…)`** : Pushover a refusé le message, pour la
  raison indiquée entre parenthèses.

**Je ne reçois rien, et les journaux ne signalent aucune erreur.** Vérifiez
que votre clé est bien enregistrée dans **Mon compte**, que la scène envoie le
message à votre utilisateur et via Pushover ou tous les services, et que
l'application Pushover est connectée sur votre téléphone. Pendant vos heures
calmes Pushover, les messages arrivent sans son.

## Confidentialité

- Le jeton d'application et les clés utilisateur sont stockés par Gladys comme
  des secrets : ils ne sont jamais réaffichés dans l'interface.
- Le texte des messages et les images de caméra transitent par les serveurs de
  Pushover, qui les suppriment une fois livrés sur vos appareils. Voir la
  [politique de confidentialité de Pushover](https://pushover.net/privacy).
- L'intégration ne communique qu'avec Gladys et l'API de Pushover
  (`api.pushover.net`).
