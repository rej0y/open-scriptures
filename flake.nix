{
  description = "Open Scriptures Tauri + SvelteKit development shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    fenix.url = "github:nix-community/fenix";
  };

  outputs = { self, nixpkgs, fenix }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
      toolchain = fenix.packages.${system}.stable.toolchain;
      tauriNativeDeps = with pkgs; [
        at-spi2-atk
        atk
        cairo
        dbus
        gdk-pixbuf
        glib
        gsettings-desktop-schemas
        gtk3
        libayatana-appindicator
        librsvg
        libsoup_3
        openssl
        pango
        webkitgtk_4_1
      ];
      gstreamerDeps = with pkgs.gst_all_1; [
        gstreamer
        gst-plugins-base
        gst-plugins-good
        gst-plugins-bad
        gst-libav
      ];
    in {
      devShells.${system}.default = pkgs.mkShell {
        packages = [
          toolchain
          pkgs.cargo-tauri
          pkgs.nodejs_22
          pkgs.pkg-config
          pkgs.sqlite
        ] ++ tauriNativeDeps ++ gstreamerDeps;

        LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath (tauriNativeDeps ++ gstreamerDeps);
        GST_PLUGIN_SYSTEM_PATH_1_0 = pkgs.lib.makeSearchPathOutput "lib" "lib/gstreamer-1.0" gstreamerDeps;
        shellHook = ''
          export XDG_DATA_DIRS="${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$XDG_DATA_DIRS"
        '';
      };
    };
}
