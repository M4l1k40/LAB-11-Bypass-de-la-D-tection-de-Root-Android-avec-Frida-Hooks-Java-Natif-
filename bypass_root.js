// bypass_root.js — Neutralise des checks Java courants (Build.TAGS, File.exists, Runtime.exec, RootBeer)

function safeContains(str, needle) {
  try { return (str || "").toLowerCase().indexOf((needle||"").toLowerCase()) !== -1; } catch (_) { return false; }
}

const suspiciousPaths = [
  "/system/bin/su", "/system/xbin/su", "/sbin/su", "/system/su",
  "/system/app/Superuser.apk", "/system/app/SuperSU.apk",
  "/system/bin/.ext/.su", "/system/usr/we-need-root/",
  "/system/xbin/daemonsu", "/system/etc/init.d/99SuperSUDaemon",
  "/system/bin/busybox", "/system/xbin/busybox"
];

Java.perform(function () {
  // 1) Forcer Build.TAGS à une valeur non suspecte
  try {
    const Build = Java.use('android.os.Build');
    Object.defineProperty(Build, 'TAGS', { get: function() { return 'release-keys'; } });
    console.log('[+] Hook Build.TAGS -> release-keys');
  } catch (e) { console.log('[-] Build.TAGS hook failed:', e); }

  // 2) RootBeer (si présent)
  try {
    const RootBeer = Java.use('com.scottyab.rootbeer.RootBeer');
    RootBeer.isRooted.implementation = function () { console.log('[+] RootBeer.isRooted -> false'); return false; };
    if (RootBeer.isRootedWithBusyBoxCheck) {
      RootBeer.isRootedWithBusyBoxCheck.implementation = function () { console.log('[+] RootBeer.isRootedWithBusyBoxCheck -> false'); return false; };
    }
  } catch (e) { console.log('[*] RootBeer non présent ou nom différent:', e.message); }

  // 3) File.exists -> retourner false pour chemins suspects
  try {
    const File = Java.use('java.io.File');
    File.exists.implementation = function () {
      const path = this.getAbsolutePath();
      if (suspiciousPaths.indexOf(path) !== -1) {
        console.log('[+] File.exists bypass for', path);
        return false;
      }
      return this.exists.call(this);
    };
  } catch (e) { console.log('[-] File.exists hook failed:', e); }

  // 4) Runtime.exec -> bloquer su/which/busybox
  try {
    const Runtime = Java.use('java.lang.Runtime');
    const JString = Java.use('java.lang.String');
    const StringArray = Java.use('[Ljava.lang.String;');

    function blockIfSuspicious(cmdOrArr) {
      const joined = Array.isArray(cmdOrArr) ? cmdOrArr.join(' ') : ('' + cmdOrArr);
      if (safeContains(joined, ' su') || joined.trim().toLowerCase().startsWith('su') || safeContains(joined, 'which su') || safeContains(joined, 'busybox')) {
        console.log('[+] Blocked Runtime.exec:', joined);
        return ['sh', '-c', 'echo'];
      }
      return null;
    }

    // exec(String)
    Runtime.exec.overload('java.lang.String').implementation = function (cmd) {
      const repl = blockIfSuspicious(cmd);
      return repl ? this.exec(JString.$new(repl.join(' '))) : this.exec(cmd);
    };
    // exec(String[])
    Runtime.exec.overload('[Ljava.lang.String;').implementation = function (arr) {
      const js = arr ? Array.from(arr) : [];
      const repl = blockIfSuspicious(js);
      if (repl) {
        const a = StringArray.$new(repl.length);
        for (let i = 0; i < repl.length; i++) a[i] = JString.$new(repl[i]);
        return this.exec(a);
      }
      return this.exec(arr);
    };
    // exec(String, String[])
    Runtime.exec.overload('java.lang.String', '[Ljava.lang.String;').implementation = function (cmd, envp) {
      const repl = blockIfSuspicious(cmd);
      return repl ? this.exec(JString.$new(repl.join(' ')), envp) : this.exec(cmd, envp);
    };
    // exec(String[], String[])
    Runtime.exec.overload('[Ljava.lang.String;', '[Ljava.lang.String;').implementation = function (arr, envp) {
      const js = arr ? Array.from(arr) : [];
      const repl = blockIfSuspicious(js);
      if (repl) {
        const a = StringArray.$new(repl.length);
        for (let i = 0; i < repl.length; i++) a[i] = JString.$new(repl[i]);
        return this.exec(a, envp);
      }
      return this.exec(arr, envp);
    };

    console.log('[+] Hooks Runtime.exec installés');
  } catch (e) { console.log('[-] Runtime.exec hooks failed:', e); }

  console.log('[+] Java layer bypass installed');
});