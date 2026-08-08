---
layout: home

hero:
  name: Defjs
  text: Des commandes typées pour HTTP, SSE et WebSocket
  tagline: Décrivez les formats d'échange avec des Structs, créez des clients explicites et gardez visibles les résultats et le cycle de vie de chaque transport.
  actions:
    - theme: brand
      text: Bien démarrer
      link: /fr-FR/guide/getting-started
    - theme: alt
      text: Voir sur GitHub
      link: https://github.com/defjs/defjs

features:
  - title: Contrats d'endpoint
    details: Distinguez les définitions d'endpoint, les constructeurs de commande et les commandes. Les Structs assurent le décodage structurel des entrées de l'appelant et des données du transport.
  - title: Résultats propres au transport
    details: HTTP, SSE et WebSocket renvoient chacun un tuple à trois éléments, avec l'erreur en premier. Le troisième contient selon le transport un wrapper de réponse, un instantané d'ouverture au démarrage ou un instantané de connexion au démarrage.
  - title: Chaînes d'intercepteurs
    details: Enregistrez des intercepteurs HTTP, SSE et WebSocket sur un client. Chaque transport sélectionne ses propres intercepteurs et les exécute en ordre « oignon ».
  - title: Cycle de vie explicite
    details: SSE peut réessayer après un échec réseau ou de lecture. La reconnexion WebSocket doit être activée explicitement. L'application reste responsable de la consommation, de l'annulation et de la fermeture définitive.
  - title: Décodage à l'exécution
    details: Décodez les entrées, réponses, événements de stream et messages WebSocket avec les mêmes contrats Struct qui pilotent l'inférence TypeScript.
  - title: Intégrations applicatives
    details: Partagez les clients avec Vue ou React et ajoutez une instrumentation OpenTelemetry sortante dans vos services serveur.
---

## Créer un client d'API typé

Commencez par décrire le contrat HTTP, SSE ou WebSocket appelé par votre application. Defjs transforme cette définition en constructeur de commande, valide les données à l'exécution et garde le résultat du transport explicite.

Le parcours HTTP principal reste court : créez un client pour votre API, définissez un endpoint, appelez son constructeur de commande, puis exécutez la commande.

```typescript
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const [error, user, response] = await client.execute(getUser({ path: { id: 1 } }))

if (error) {
  console.error(error.kind, error.code)
} else {
  console.log(user.name, response.status)
}
```

Pointez le client vers le service utilisé par votre application et alignez les Structs sur son contrat de réponse réel. Votre application reste responsable des identifiants, de l'état de l'interface, des relances, de l'annulation et du nettoyage des ressources.

## À lire ensuite

- [Bien démarrer](/fr-FR/guide/getting-started) installe le package et accompagne votre application jusqu'à sa première requête typée.
- [Client](/fr-FR/core/client) explique la composition des options et les trois surcharges de `execute`.
- [Commandes](/fr-FR/core/commands) décrit les définitions d'endpoint, constructeurs de commande, commandes et projections liées au schéma.
- [HTTP](/fr-FR/core/http), [SSE](/fr-FR/core/sse) et [WebSocket](/fr-FR/core/web-socket) détaillent les transports et la responsabilité de leur cycle de vie.
- [Vue](/fr-FR/plugins/vue), [React](/fr-FR/plugins/react) et [OpenTelemetry Server](/fr-FR/plugins/opentelemetry-server) montrent comment relier Defjs au framework et à la télémétrie de votre application.
