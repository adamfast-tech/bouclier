# Bouclier

Carnet de suivi des injections de Xolair (omalizumab), en web app pour iPhone. HTML/CSS/JS vanilla, hors ligne une fois ouverte.

**Lien :** https://adamfast-tech.github.io/bouclier/

## Ce que fait l'app

- **Accueil** : anneau animé du compte à rebours jusqu'à la prochaine piqûre (intervalle réglable, 28 jours par défaut), statut (tout roule, bientôt, jour J, en retard), stock de stylos au frigo avec la date jusqu'à laquelle il couvre.
- **Je fais ma piqûre** : parcours guidé plein écran en 5 étapes : check-list de préparation, choix du site sur une silhouette (site conseillé pour alterner, dernier site utilisé), respiration guidée, compteur pendant l'injection, petit bilan (qui l'a faite, douleur, ressenti, note). Confettis, badge et compteur de stylos mis à jour à la fin.
- **Historique** : frise par mois, piqûres faites et manquées numérotées (n°1, n°2…), modification et suppression, ajout d'anciennes piqûres.
- **Progrès** : injections faites, régularité, série en cours, badges (première en solo, pro du stylo, zen…), courbe de la douleur, carte des sites utilisés.
- **Profil** : prénom affiché, fréquence, dose, heure du rappel, partage du suivi, rappels calendrier, export CSV, thème clair/sombre.

## Compte

Même compte que l'Académie (CMD & PowerShell, W203, tagalog) : e-mail ou nom d'utilisateur + mot de passe, projet Supabase partagé. Chaque compte a son propre suivi ; personne d'autre ne le voit tant qu'il n'est pas partagé (RLS).

## Partager le suivi

Profil › Partager mon suivi › nom d'utilisateur de l'autre personne. Elle voit les piqûres, peut en enregistrer (par exemple quand c'est elle qui pique) et ajuster le stock de stylos. Les réglages du traitement restent à la personne suivie.

## Rappels sur l'iPhone

Profil › Rappels sur l'iPhone › Activer, puis **S'abonner dans Calendrier**. Sur l'écran d'abonnement, désactiver **Supprimer les alertes**, puis **Ajouter**. Le calendrier « Bouclier · Xolair » affiche la prochaine piqûre et se met à jour tout seul après chaque enregistrement, avec trois alertes : la veille, 40 minutes avant (sortir le stylo du frigo) et à l'heure choisie. La personne avec qui le suivi est partagé peut s'abonner aussi.

Le flux est servi par la fonction Edge `bouclier-calendar` (dossier `supabase/functions`), protégée par un jeton aléatoire régénérable dans l'app.

## Installer sur iPhone

1. Ouvrir le lien dans **Safari**.
2. Toucher **Partager**.
3. Choisir **Sur l'écran d'accueil**, puis **Ajouter**.

## Technique

- `index.html` (styles), `app.js` (logique), `sw.js` (hors ligne), `vendor/` (supabase-js 2.117.0, MIT).
- Schéma : `supabase/bouclier_xolair.sql` (tables `xolair_settings`, `xolair_injections`, `xolair_shares`, fonctions de partage, stock, calendrier).

## Avertissement

Bouclier est un carnet de suivi. Il ne remplace ni la notice du stylo ni l'avis du médecin. En cas de réaction allergique grave : adrénaline si elle est prescrite, puis 15 ou 112.
