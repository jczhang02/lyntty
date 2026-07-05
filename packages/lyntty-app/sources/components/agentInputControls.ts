export function shouldShowAbortControl(showAbortButton?: boolean, hasAbortHandler?: boolean): boolean {
    return showAbortButton === true && hasAbortHandler === true;
}
