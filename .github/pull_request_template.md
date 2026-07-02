## Summary

- 

## Verification

- [ ] `python -m unittest discover -s tests -p "test_*.py" -v`
- [ ] `npm --prefix ui run build:renderer`
- [ ] `npm --prefix ui run smoke`
- [ ] `npm --prefix ui run test:ui-quality` for UI or screenshot changes
- [ ] Packaging checked or not applicable

## Safety impact

- [ ] No config schema change
- [ ] No new privileged Windows operation
- [ ] No anti-cheat bypass or tampering behavior
- [ ] Protected process behavior reviewed when relevant

## Notes

Mention Windows version, Python version, game/workload, Administrator status, background-jailing status, and screenshots when relevant.
