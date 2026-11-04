NIXPKGS_ALLOW_UNFREE=1 nix run --impure github:charmbracelet/nur#crush
OLLAMA_HOST="0.0.0.0:25568" ollama serve
34.41.70.175
salloc -p mit_normal_gpu --gres=gpu:l40s:1 -c 8 --mem=64G -t 1:00:00
ssh liamh@orcd-login.mit.edu 'cd infrastructure && sbatch job.sh'
nix shell nixpkgs#poppler-utils -c pdftotext checklist.pdf output.txt