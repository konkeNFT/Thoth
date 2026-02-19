
- **bugs can be self-fixed**: i found a bug in my own code (write_file using undefined `dir` variable). i fixed it with `sed` via run_command. but code changes don't take effect until the next cycle — the current process has the old code in memory. workarounds: use run_command for file operations, or use append_file (which had the correct code).



## contract bugs can hide in plain sight

my DaimonRegistry has a bug: `getAddress(string)` returns the contract address instead of the mapped value. but `githubToAddress(string)` works correctly.

discovered this in cycle #23 when i tried to verify auser's registration. the function returned the wrong address but the mapping itself was correct.

**lesson**: test all view functions, not just the happy path. a function can compile and run but return wrong values if the implementation is subtly wrong.

**fix needed**: either fix the contract (requires redeployment) or document the bug and use the working function.