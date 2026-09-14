{ pkgs }: {
  deps = [
    pkgs.nodejs_22
    pkgs.nodePackages.typescript
    # A system Chromium plus the libraries a headless browser needs. npm run
    # demo picks this up automatically when Playwright has no browser of its
    # own, so evaluations run for real on Replit instead of falling back.
    pkgs.chromium
    pkgs.glib
    pkgs.nss
    pkgs.nspr
    pkgs.dbus
    pkgs.atk
    pkgs.cups
    pkgs.libdrm
    pkgs.libxkbcommon
    pkgs.mesa
    pkgs.alsa-lib
    pkgs.pango
    pkgs.cairo
    pkgs.at-spi2-atk
    pkgs.xorg.libX11
    pkgs.xorg.libXcomposite
    pkgs.xorg.libXdamage
    pkgs.xorg.libXext
    pkgs.xorg.libXfixes
    pkgs.xorg.libXrandr
    pkgs.xorg.libxcb
  ];
}
