---
title: Décisions de conception
description: Pourquoi Defjs privilégie les clients explicites, les tuples propres au transport, les projections et les observateurs.
---

# Décisions de conception

Cette page expose les raisons qui ont conduit à l'API actuelle. Les pages de référence décrivent les champs et leurs valeurs par défaut.

## Clients explicites

Defjs ne fournit aucun client global par défaut à l'échelle du processus. `createClient(...)` rend le propriétaire visible au point d'appel et permet à l'application de séparer ses clients selon les endpoints, les identifiants, les tests ou la portée d'une requête.

Cette isolation reste partielle. Les intercepteurs et callbacks d'option peuvent capturer un même état applicatif ; deux objets client ne sont donc pas forcément isolés de leur environnement. `setErrorMap(...)` agit lui aussi sur tout le processus. Côté serveur, créez un client par requête dès qu'une option ou une fonction capturée contient des données de requête, d'utilisateur, de tenant, de cookie ou d'autorisation.

Un client explicite facilite aussi l'identification du propriétaire des ressources, mais il ne les gère pas lui-même. Il ne suit et ne libère ni les requêtes HTTP, ni les handles SSE, ni les sessions WebSocket actifs.

## Tuples propres au transport

Toutes les commandes prises en charge renvoient un tuple à trois éléments, avec l'erreur en premier. Le troisième garde le sens propre à son transport :

```typescript
const [httpError, data, response] = await client.execute(httpCommand)
const [sseError, stream, startupOpen] = await client.execute(sseCommand)
const [socketError, session, startupConnection] = await client.execute(socketCommand)
```

Cette distinction évite de confondre dans une abstraction vague un wrapper de réponse HTTP, un instantané d'ouverture SSE au démarrage et un instantané de connexion WebSocket au démarrage. Le deuxième élément suit la même logique : HTTP renvoie les données décodées, SSE un handle logique de flux et WebSocket une session logique.

Le tuple rend explicites les échecs attendus au démarrage sans imposer un contrôle de flux par exceptions. Il ne garantit pas qu'un intercepteur, un callback, un listener ou une valeur non prise en charge ne puisse jamais rejeter une promesse ou lever une exception.

## Les options de cycle de vie appartiennent à l'exécution

Les définitions d'endpoint décrivent des contrats d'échange stables et possèdent les limites des files de transport. L'annulation, le timeout, le heartbeat et la reconnexion relèvent de l'exécution qui possède le travail.

HTTP et SSE acceptent des options d'annulation à l'exécution. WebSocket accepte aussi, pour chaque exécution, les options `beforeConnect`, heartbeat, reconnexion et sous-protocoles. Les options du client fournissent des valeurs par défaut réutilisables lorsque le transport le permet ; les capacités entrante et sortante de WebSocket restent définies sur l'endpoint.

Cette séparation permet de réutiliser une commande. Un traitement en arrière-plan et un écran interactif peuvent l'exécuter avec des durées de vie différentes sans redéfinir son chemin ni son schéma de message.

## `build` utilise des projections

Le `build(request, input)` personnalisé reçoit une vue de liaison déclarative dérivée de la Struct d'entrée. Il n'a pas accès aux valeurs fournies à l'exécution par l'appelant.

Cette vue indique comment les champs source se projettent vers `path`, `query`, `headers` et `body`. Le modèle permet de sélectionner des champs, de choisir explicitement les clés du format d'échange et de projeter un tableau élément par élément. Il interdit volontairement les branches dépendantes des valeurs, les transformations arbitraires et l'injection de valeurs littérales.

Cette contrainte lie la construction de la requête aux champs déclarés par les Structs. Effectuez la normalisation et la validation métier dans l'application avant de créer une commande. Consultez [Commandes](/fr-FR/core/commands) pour les formes de projection prises en charge.

## Les observateurs ne contrôlent pas le flux

Le callback SSE `onInvalidEvent` observe les événements écartés. Les exceptions et les promesses rejetées sont isolées du flux de contrôle du stream, qui poursuit son traitement ; un observateur asynchrone reste toutefois attendu et peut retarder les messages suivants.

Les listeners WebSocket d'état et d'erreur d'exécution sont eux aussi des observateurs. Les exceptions et les promesses rejetées sont isolées : l'échec d'un listener d'état est transmis aux listeners d'erreur d'exécution, l'échec de ces derniers au `reportError` global s'il existe, tandis que les autres listeners et le cycle de vie continuent.

Pilotez le cycle de vie avec le handle ou la session renvoyé. Réservez les observateurs à une journalisation bornée, aux métriques ou aux mises à jour d'état, puis retirez-les lorsque leur propriétaire disparaît.

## Références associées

- [Client](/fr-FR/core/client) décrit la composition des options et la portée du client.
- [Erreurs](/fr-FR/core/errors) décrit les échecs des tuples et la disponibilité de la réponse.
- [SSE](/fr-FR/core/sse) et [WebSocket](/fr-FR/core/web-socket) distinguent handles logiques, tentatives physiques et fermeture définitive.
