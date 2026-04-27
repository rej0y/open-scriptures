{
  description = "Rust Dev Shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    fenix.url = "github:nix-community/fenix";
  };

  outputs = { self, nixpkgs, fenix }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
      toolchain = fenix.packages.${system}.stable.toolchain;
    in {
      devShells.${system}.default = pkgs.mkShell {
        buildInputs = [
          toolchain
        ];
      };
    };
}
