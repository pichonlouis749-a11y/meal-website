# Bugs et corrections

Ce fichier retrace les bugs rencontrés, les corrections appliquées, et les garde-fous ajoutés pour stabiliser le projet.

## 1. Lancement local depuis le mauvais dossier

**Symptôme**

`npm start` était lancé depuis le dossier utilisateur, donc npm ne trouvait pas `package.json`.

**Correction**

Le lancement doit se faire depuis le dossier du projet :

```bash
cd "/Users/louispichon/Library/Mobile Documents/com~apple~CloudDocs/Documents perso/Meal_website"
npm start
```

**Garde-fou**

Le fichier `HISTORIQUE_ET_PUSH.md` documente maintenant le dossier exact du projet.

## 2. Création de compte sans confirmation claire

**Symptôme**

Après création d’un compte, l’interface ne donnait pas assez de feedback et la connexion semblait échouer.

**Correction**

Le formulaire affiche maintenant un message après inscription, notamment quand Supabase demande une confirmation par email.

**Garde-fou**

Les erreurs Supabase fréquentes sont traduites en messages plus compréhensibles dans `friendlyAuthError()`.

## 3. Confusion entre inscription et connexion

**Symptôme**

Le formulaire de connexion ressemblait trop au formulaire d’inscription.

**Correction**

La connexion est revenue au format simple :

- email
- mot de passe
- bouton connexion
- bouton mot de passe oublié

Le pseudo est réservé à l’inscription et à l’affichage.

**Garde-fou**

La logique `updateAuthDialog()` masque le champ pseudo hors mode inscription.

## 4. Champ pseudo encore visible en connexion

**Symptôme**

Même quand JavaScript marquait le champ pseudo comme `hidden`, le CSS `.field { display: grid; }` le rendait visible.

**Correction**

Ajout d’une règle CSS globale :

```css
[hidden] {
  display: none !important;
}
```

**Garde-fou**

Cette règle protège tous les éléments cachés actuels et futurs, pas seulement le champ pseudo.

## 5. Suppression de recette accessible aux utilisateurs simples

**Symptôme**

Un utilisateur non admin pouvait voir ou utiliser la suppression.

**Correction**

La suppression est réservée au rôle `admin` côté interface et côté Supabase RLS.

**Garde-fou**

La règle Supabase `Admins can delete recipes` limite la suppression aux profils admin.

## 6. Recettes visibles par les visiteurs non connectés

**Symptôme**

Les recettes étaient lisibles sans compte.

**Correction**

La politique Supabase de lecture a été changée pour limiter la lecture aux utilisateurs authentifiés.

**Garde-fou**

L’interface affiche un écran d’accès privé quand aucune session n’est active.

## 7. Header incohérent connecté / déconnecté

**Symptôme**

Les boutons `Connexion` et `Ajouter une recette` restaient visibles sur l’écran privé.

**Correction**

Le header masque les actions tant que la session n’est pas confirmée.

**Garde-fou**

`updateAdminUi()` centralise maintenant l’état du header :

- déconnecté : actions cachées
- connecté : `Bienvenue pseudo`, bouton `Ajouter une recette`, bouton `Déconnexion`

## 8. Refresh connecté avec page blanche

**Symptôme**

Après refresh sur la page d’accueil, le header apparaissait mais le contenu restait vide.

**Correction**

Le démarrage a été renforcé :

- état de chargement immédiat
- timeouts sur les appels Supabase
- rendu d’erreur avec bouton `Réessayer`
- rendu forcé après connexion
- écoute Supabase Auth sans callback async directe

**Garde-fou**

Un test simulé local vérifie maintenant les deux cas critiques :

- refresh connecté : accueil et recettes visibles
- refresh déconnecté : écran privé visible

## 9. Tentative de connexion par pseudo abandonnée

**Symptôme**

La connexion par pseudo demandait une route serveur et une clé `service_role` côté Hostinger, ce qui complexifiait inutilement la V1.

**Correction**

La connexion par pseudo a été retirée.

**Garde-fou**

Aucune variable `SUPABASE_SERVICE_ROLE_KEY` n’est nécessaire pour Hostinger. La connexion se fait uniquement par email.

## 10. Cache navigateur / Hostinger

**Symptôme**

Après redeploy, le navigateur pouvait garder une ancienne version de `app.js` ou `styles.css`.

**Correction**

Les URLs des fichiers publics utilisent un suffixe de version :

```html
/styles.css?v=email-auth-5
/app.js?v=email-auth-5
```

**Garde-fou**

À chaque changement important d’interface ou d’auth, augmenter ce suffixe.

## Vérifications standard avant push

```bash
node --check public/app.js
node --check server.js
git diff --check
git status
```

## Tests manuels après redeploy

1. Ouvrir le site en navigation privée.
2. Vérifier que le contenu est bloqué sans connexion.
3. Se connecter avec email + mot de passe.
4. Vérifier que les recettes s’affichent.
5. Rafraîchir la page d’accueil connecté.
6. Vérifier que le contenu reste visible.
7. Se déconnecter.
8. Vérifier le retour à l’écran privé.
