# Browstack

[English](README.md) · [繁體中文](README.zh-TW.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md) · **Français**

**Browser + Substack** — transformez votre propre historique de navigation en un digest hebdomadaire personnel, magnifiquement mis en page et respectueux de la vie privée, livré dans votre boîte mail comme une véritable newsletter.

<p align="center">
  <img src="docs/images/sample-cover.jpg" width="420" alt="Couverture d'exemple générée par le moteur, dans la tradition illustrée du New Yorker" />
  <br/>
  <em>Chaque numéro reçoit une couverture fraîchement générée dans la tradition illustrée du New Yorker,<br/>inspirée de ce que vous avez réellement lu cette semaine-là.</em>
</p>

## Pourquoi

Vous ouvrez des articles depuis les réseaux toute la journée, sans jamais les finir, et ils s'entassent dans des favoris que vous ne rouvrirez jamais. L'idée centrale de Browstack : **naviguer, c'est déjà saisir**. Votre historique vit déjà sur votre machine — aucun bouton « enregistrer » nécessaire. Browstack le lit localement, ne garde que le contenu de connaissance, résume chaque article assez bien pour remplacer une relecture, et met le tout en page dans un numéro hebdomadaire digne d'être conservé.

**Vous êtes votre propre éditeur.** Chaque numéro est privé par défaut — toute publication vers l'extérieur est un opt-in explicite, pièce par pièce.

> ### ⚡ Le chemin le plus rapide : votre numéro №0 en trois minutes
>
> ```bash
> git clone https://github.com/howieyoung/browstack.git && cd browstack
> npm install                          # creates your personal config file
> claude /login                        # use your Claude subscription as the LLM (or an API key)
> npm run ingest && npm run enrich && npm run preview
> open out/browstack-issue-0.html      # your preview issue!
> ```
>
> Ces cinq étapes ne nécessitent **aucune clé API payante** : votre historique Chrome existant, le CLI Claude Code (sans clé supplémentaire) et une couverture par défaut incluse. Ajoutez la couverture générée par IA (OpenAI) et la livraison par e-mail (Gmail) plus tard via les guides de configuration ci-dessous.

### 🤖 Ou laissez votre agent IA tout configurer

Après le clonage, ouvrez **Claude Code** (ou Codex, ou n'importe quel coding agent) dans ce dossier et dites-lui :

> **« Analyse ce projet et guide-moi dans la configuration. »**

Le dépôt inclut [AGENTS.md](AGENTS.md) — un manuel pas à pas que votre agent suit pour tout configurer *avec* vous : configuration personnelle, connexion LLM, votre premier numéro, clés de couverture, livraison Gmail, l'extension Chrome et la planification hebdomadaire. Il fait aussi respecter les règles de confidentialité (vos clés vont dans le Trousseau macOS, jamais dans le chat).

## Fonctionnement

```
Chrome History ─┐
                ├→ classify → enrich → cover → render → send
Extension ──────┘   (knowledge   (LLM      (art     (nameplate,  (SMTP,
 (true reading       filter +     summar-   director  topics,      inline
  signals)           privacy      ies)      + image    summaries)   cover)
                     firewall)              engine)
```

- **Ingest** — lit la base History locale de Chrome (une copie — Chrome verrouille l'original). Si Chrome Sync est activé, la navigation de votre téléphone est incluse automatiquement.
- **Extension (MV3)** — compte les secondes de lecture *active* (onglet visible + interaction récente) et capture le texte de l'article au moment où vous le lisez, y compris derrière les murs de connexion. Ne parle **qu'à `127.0.0.1`** — rien ne quitte jamais votre machine.
- **Classify** — règle stricte : le contenu qui n'est pas de la connaissance (potins, loteries, promos, recherches éclair) n'entre jamais dans le numéro, quel que soit le temps passé. Les pages sensibles (banque, e-mail, authentification, services publics) ne sont même pas stockées.
- **Enrich** — un LLM rédige trois points + une conclusion par article, et une ligne de contexte éditorial par publication sociale.
- **Cover** — un directeur artistique LLM distille la semaine en une seule métaphore visuelle, puis un moteur d'image la peint sous une direction artistique fixe (gouache plate, palette limitée, généreux espace négatif — aucun texte dans l'œuvre).
- **Render & send** — bandeau de magazine (numéro №, période, logotype, devise), résumés groupés par thème, statistiques hebdomadaires. Chaque pièce affiche **combien de temps vous l'avez lue cette semaine-là** — la raison de sa sélection. Envoyé via votre propre Gmail SMTP avec la couverture intégrée en pièce jointe CID.
- **Pas de boucle d'auto-alimentation** — une fois un numéro envoyé, ses pièces sont scellées (`published_in`) et ne peuvent jamais réapparaître, même si vous les relisez depuis le digest lui-même.

## Principes de confidentialité

1. **Local d'abord.** L'analyse, le filtrage et le classement se font sur votre machine. Le seul interlocuteur réseau de l'extension est `127.0.0.1`.
2. **Filtrer avant tout appel cloud.** Seul le texte extrait des pages classées comme contenu atteint un LLM. Les pages bancaires, e-mail, authentification et administratives ne quittent jamais la machine — elles ne sont même pas écrites dans la base de Browstack.
3. **Les secrets vivent dans le Trousseau macOS**, pas dans les dotfiles ni les exports d'environnement.
4. **La publication est un opt-in pièce par pièce.** Il n'existe aucune voie de publication automatique.

## Prérequis

- macOS 13+ (Trousseau et `sips` sont utilisés ; Linux/Windows nécessiteraient de petites substitutions)
- Google Chrome (Chrome Sync recommandé — intègre la navigation mobile au digest)
- Node.js 20+
- Un LLM : [Claude Code CLI](https://claude.com/claude-code) (utilise votre abonnement existant) **ou** une clé API Anthropic
- Optionnel : une clé API OpenAI (rendu des couvertures), un compte Gmail (livraison par e-mail)

## Démarrage rapide

```bash
git clone https://github.com/<you>/browstack.git
cd browstack
npm install                 # also creates src/shared/userConfig.ts from the template
$EDITOR src/shared/userConfig.ts   # your email, Chrome profile, personal noise domains

npm run ingest              # import & classify your Chrome history (local only)
npm run stats               # sanity check: classification stats + top candidates
npm run enrich              # LLM: knowledge filter + summaries  (see LLM setup below)
npm run cover               # generate this issue's cover        (see OpenAI setup below)
npm run preview             # writes out/browstack-issue-0.html — open it!
npm run send                # email the issue to yourself        (see Gmail setup below)
```

### Extension (vrais signaux de lecture)

```bash
npm run build:ext
npm run serve               # local receiver on 127.0.0.1:8787 — keep it running
```

Puis ouvrez `chrome://extensions` → activez le **Mode développeur** → **Charger l'extension non empaquetée** → sélectionnez le dossier `extension/`. Les pages que vous lisez activement pendant 30+ secondes sont capturées (texte + profondeur de défilement + secondes actives) et atterrissent dans la base locale. Le popup affiche l'état du récepteur et la longueur de la file.

## Guides de configuration (une seule fois)

### 1 · Fournisseur LLM

**Option A — Claude Code CLI (par défaut, aucune clé API à gérer) :**

```bash
claude /login    # once, in a terminal
```

**Option B — API Anthropic :** mettez `llm.provider: "anthropic"` dans `src/config.ts` et exportez `ANTHROPIC_API_KEY`.

### 2 · Clés de génération de couverture (à faire pendant l'onboarding)

**La couverture est ce qui rend chaque numéro vivant — configurez-la.** Un clone frais inclut une couverture par défaut (`assets/cover-default.jpg`, l'art du numéro inaugural), vous n'êtes donc jamais sans couverture, mais **tous les numéros réutiliseraient la même image**. Pour obtenir une couverture *unique* générée à partir de vos lectures réelles de la semaine, il vous faut deux clés :

- **Un LLM** (le *directeur artistique*) — le CLI Claude Code ou l'API Anthropic déjà configurés à l'étape 1. Il lit les thèmes de la semaine et conçoit une métaphore visuelle + un prompt d'image.
- **Une clé OpenAI** (le *moteur de rendu*) — transforme ce prompt en illustration finale via `gpt-image-1`.

Sans clé OpenAI, Browstack se replie sur votre **LLM d'abonnement qui dessine lui-même la couverture en illustration SVG** (modèle le plus puissant, effort de raisonnement élevé) — chaque numéro garde ainsi une couverture unique. Le moteur OpenAI produit simplement un art raster plus riche. La couverture par défaut incluse n'est que le dernier recours.

Sur [platform.openai.com](https://platform.openai.com), créez un **projet dédié + une clé avec plafond de dépenses mensuel** (une image par semaine coûte très peu — un plafond de 10 $ est généreux). Puis stockez-la dans le Trousseau — notez l'**espace initial** qui évite que la commande reste dans l'historique du shell :

```bash
 security add-generic-password -s browstack-openai -a "$USER" -w '<your-key>' -U
```

`npm run cover` la trouve automatiquement (la variable d'environnement `OPENAI_API_KEY` a priorité si définie). Ne mettez jamais de clés dans `~/.zshrc` — texte en clair sur disque, hérité par tous les processus, et la synchronisation des dotfiles est la voie de fuite classique.

### 3 · Gmail SMTP pour la livraison (Trousseau macOS)

À faire une seule fois :

1. [Compte Google → Sécurité → Validation en deux étapes → Mots de passe d'application](https://myaccount.google.com/apppasswords) — générez-en un (nom libre, p. ex. `browstack`).
2. Dans un terminal (notez l'espace initial) :

```bash
 security add-generic-password -s browstack-smtp -a you@example.com -w '<16-char app password>' -U
```

3. `npm run send` — le numéro №0 arrive dans votre boîte, couverture intégrée en haut. (Les clients mail rejettent les images `data:` URI mais acceptent les pièces jointes CID — c'est ce que Browstack utilise.)

### 4 · Automatisation hebdomadaire (launchd)

Une seule commande planifie l'exécution complète — `ingest → enrich → cover → send` — en LaunchAgent macOS :

```bash
npm run schedule:weekly                        # every Saturday 08:17 by default
npm run schedule:weekly -- --day 1 --hour 9    # e.g. Mondays at 09:00 (--day 0–6, 0 = Sunday)
```

- S'exécute dans votre session utilisateur, le Trousseau (secrets LLM/OpenAI/SMTP) est donc disponible.
- Si votre Mac dort à l'heure prévue, launchd exécute la tâche au réveil suivant.
- Un échec du rendu de couverture (p. ex. clé OpenAI manquante) ne bloque pas le numéro — la couverture précédente est réutilisée.
- Une défaillance passagère du LLM ne tue pas non plus l'exécution : la classification est retentée une fois et le numéro part avec ce qui est déjà enrichi. Un numéro vide n'est jamais envoyé.
- La planification se déclenche deux fois chaque samedi (08 h 17 principal, 20 h 17 nouvelle tentative) ; si le numéro est déjà parti, la nouvelle tentative est ignorée automatiquement. Un échec fatal déclenche une notification macOS au lieu d'échouer en silence.
- Un battement de cœur quotidien (09 h 37) garde la session du CLI Claude fraîche et vous prévient plusieurs jours à l'avance si `claude /login` redevient nécessaire.
- Garde-fous qualité intégrés : les fragments d'extraction (< 300 caractères) et les publications sociales dupliquées sont automatiquement rétrogradés ; les recherches encyclopédie/dictionnaire ne se qualifient jamais.
- Logs : `data/logs/weekly.log`. Exécution manuelle à tout moment : `npm run weekly`.
- Désinstallation : `launchctl bootout gui/$UID/com.browstack.weekly && rm ~/Library/LaunchAgents/com.browstack.weekly.plist`

### Numéros et archives

Chaque numéro est numéroté et conservé : №0 est le numéro d'aperçu ; ensuite, chaque numéro est simplement №N — la progression est portée par le numéro lui-même. Un `send` réussi scelle le numéro courant ; l'exécution suivante en ouvre automatiquement un nouveau avec une couverture neuve. Les artefacts s'accumulent dans `out/` (versions web + e-mail par numéro) et `assets/covers/` (une couverture par numéro), avec des archives consultables dans `out/index.html`. Si la couverture d'une semaine échoue au rendu, celle du numéro précédent est réutilisée.

## Principes éditoriaux

- **La connaissance est un filtre strict.** Potins people, loteries, promos shopping, inscriptions à des événements et recherches éclair type dictionnaire sont exclus quel que soit le temps de lecture.
- **Les résumés doivent remplacer l'original.** Trois points ≤ 42 caractères + une conclusion ≤ 32 caractères par article.
- **Le numéro est un artefact.** Palette fixe, bandeau serif, numérotation — la beauté le fait ouvrir, la qualité du contenu le fait finir.

## Feuille de route

- Scoring v2 : signaux de lecture active dans le classement ; normalisation des thèmes
- UI de curation : choisir les pièces, ajouter vos propres avis, publier une sélection vers l'extérieur
- Cibles de publication : liste personnelle via SMTP/SendGrid, export Ghost/Buttondown

## Licence

[MIT](LICENSE)
