# Patch files for the remaining stories

This branch exists only to carry the prepared code changes. **Never merge it into `main`.**

Each patch is applied on the branch for its story, in this order:

| Order | Story | Owner | Depends on |
|---|---|---|---|
| 3rd | SMS-2 | Janhavi | SMS-3 merged |
| 4th | SMS-6 | Mayank | SMS-2 merged |
| 5th | SMS-7 | Mayank | SMS-6 merged |
| 6th | SMS-8 | Janhavi | SMS-7 merged |

## How to use one

```bash
git checkout main
git pull origin main
git checkout -b feature/SMS-2-add-student
git fetch origin handoff
git show origin/handoff:patches/SMS-2.patch | git apply --ignore-whitespace
git add -A
git commit -m "SMS-2 Add student record completed"
git push -u origin feature/SMS-2-add-student
```

Nothing is downloaded and no script is run, so file paths, execute permissions
and macOS quarantine cannot get in the way.
