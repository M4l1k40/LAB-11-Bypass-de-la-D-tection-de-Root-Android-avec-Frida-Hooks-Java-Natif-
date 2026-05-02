# Writeup — LAB 11 : Bypass de la Détection de Root Android avec Frida (Hooks Java & Natif)

## Objectif

Contourner les mécanismes de détection de root d'une application Android (`com.pwnsec.firestorm`) en utilisant Frida pour hooker à la fois la couche Java et la couche native, afin d'extraire un mot de passe Firebase généré dynamiquement.

---

## Environnement

| Élément | Détail |
|---|---|
| Outil | Frida 17.9.1 |
| Émulateur | Android Emulator 5554 (x86_64) |
| Cible | `com.pwnsec.firestorm` |
| OS | Windows (PowerShell) |
| Scripts | `bypass_root.js`, `bypass_native.js`, `frida.js` |

---

## Étapes

### 1. Push du serveur Frida sur l'émulateur

```bash
adb -s emulator-5554 push C:\Users\lenovo\Downloads\frida-server-17.9.1-android-x86_64 /data/local/tmp/
```
<img width="1600" height="113" alt="image" src="https://github.com/user-attachments/assets/7924cf38-b331-4c18-80fe-77415c0a6a06" />

Le binaire Frida Server (110 MB) est transféré avec succès vers `/data/local/tmp/` sur l'émulateur. C'est le composant qui tourne côté Android et qui permet à Frida d'instrumenter les processus.

> Ne pas oublier ensuite de le rendre exécutable et de le lancer :
> ```bash
> adb shell chmod +x /data/local/tmp/frida-server-17.9.1-android-x86_64
> adb shell /data/local/tmp/frida-server-17.9.1-android-x86_64 &
> ```

---

### 2. Vérification des processus actifs

```bash
frida-ps -Uai
```
<img width="873" height="249" alt="image" src="https://github.com/user-attachments/assets/c4342e69-c460-4ab2-b975-1f3ae176ef8b" />

La commande liste les applications installées et en cours d'exécution sur l'émulateur. On repère bien la cible parmi les processus disponibles.

```
PID   Name     Identifier
4817  Camera   com.android.camera2
5532  Chrome   com.android.chrome
4050  Files    com.google.android.documentsui
2726  Google   com.google.android.googlequicksearchbox
```

---

### 3. Premier hook — Bypass Java uniquement (`bypass_root.js`)

```bash
frida -U -f com.pwnsec.firestorm -l C:\Users\lenovo\Desktop\bypass_root.js
```

**Résultat :**
<img width="1600" height="527" alt="image" src="https://github.com/user-attachments/assets/203ce243-9a8c-4260-8fb3-b7ba149ca2d3" />

```
[+] Hook Build.TAGS -> release-keys
[*] RootBeer non présent ou nom différent: java.lang.ClassNotFoundException
[+] Hooks Runtime.exec installés
[+] Java layer bypass installed
```

**Analyse :**

- **`Build.TAGS` → `release-keys`** : L'application vérifie si `android.os.Build.TAGS` vaut `"test-keys"` (signe d'un build rooté). Le hook retourne `"release-keys"` pour simuler un appareil non rooté.
- **`RootBeer` absent** : La lib de détection RootBeer n'est pas présente dans l'APK, ou son nom de classe est différent. Le hook tente quand même de la neutraliser.
- **`Runtime.exec`** : Les appels système comme `which su`, `ls /system/xbin/su` etc. sont interceptés et retournent des résultats vides.

> À ce stade, le mot de passe n'est pas encore extrait — la détection native bloque encore l'exécution.

---

### 4. Bypass complet — Java + Natif + Extraction

```bash
frida -U -f com.pwnsec.firestorm \
  -l C:\Users\lenovo\Desktop\bypass_root.js \
  -l C:\Users\lenovo\Desktop\bypass_native.js \
  -l C:\Users\lenovo\Desktop\frida.js
```

**Résultat :**
<img width="1600" height="707" alt="image" src="https://github.com/user-attachments/assets/b98ba1e9-0684-47c7-8708-3872dba4e051" />

```
[+] Hook Build.TAGS -> release-keys
[*] RootBeer non présent ou nom différent: ClassNotFoundException
[+] Hooks Runtime.exec installés
[+] Java layer bypass installed
[*] Script chargé. Attente de 3 secondes avant exécution...
[*] Début de la recherche d'instances de MainActivity...
[+] MainActivity instance trouvée : com.pwnsec.firestorm.MainActivity@d733a8e
[+] Mot de passe Firebase généré : C7_dotpsC7t7f_._In_i.IdttpaofoaIIdIdnndIfC
[*] Recherche des instances terminée.
```

**Analyse :**

- **`bypass_native.js`** : Hooke les fonctions natives via `Interceptor.attach` sur des symboles natifs qui effectuent des vérifications au niveau du système de fichiers (`/proc/`, `/system/bin/su`, etc.) ou via `libc`. Ces vérifications ne peuvent pas être interceptées depuis Java.
- **`frida.js`** : Après un délai de 3 secondes (pour laisser l'app s'initialiser), parcourt les instances de `MainActivity` en mémoire via `Java.choose()` et invoque la méthode de génération du mot de passe Firebase.
- **Le mot de passe est exfiltré** : `C7_dotpsC7t7f_._In_i.IdttpaofoaIIdIdnndIfC`

---

## Mécanismes de détection bypassés

| Mécanisme | Couche | Technique de bypass |
|---|---|---|
| `Build.TAGS` check | Java | Hook getter, retourne `"release-keys"` |
| `Runtime.exec("su")` | Java | Hook, retourne un process vide |
| RootBeer library | Java | Neutralisation des méthodes de la classe |
| Vérifications fichiers `/su`, `/system/xbin` | Natif | `Interceptor.attach` sur `libc.so` (`access`, `stat`, `open`) |
| Détection via `/proc/` | Natif | Hook syscalls natifs |

---

## Flag / Résultat

```
Mot de passe Firebase : C7_dotpsC7t7f_._In_i.IdttpaofoaIIdIdnndIfC
```

---

## Leçons retenues

1. **La détection de root multi-couches** (Java + natif) est significativement plus robuste qu'une détection purement Java. Un bypass Java seul ne suffit pas.
2. **`Java.choose()`** est une technique puissante pour interagir avec des instances déjà créées en mémoire sans avoir à rejouer le flux d'initialisation.
3. **Le délai d'attente** dans le script est une bonne pratique pour s'assurer que l'application est pleinement initialisée avant l'injection.
4. **Frida reste l'outil de référence** pour ce type d'analyse dynamique grâce à sa capacité à opérer simultanément sur les deux couches d'exécution Android.
