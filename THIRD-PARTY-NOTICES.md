# Third-party notices

Plan Studio bundles the files below under `vendor/`, and ships them as part of the widget. Each
one's licence requires its copyright notice to travel with the code; Apache-2.0 additionally
requires a copy of the licence itself. This file carries both.

Nothing here changes the licence of the ANUPRESS source, which is MIT — see `LICENSE`.

---

## Grist Plugin API

`vendor/grist-plugin-api.js` — <https://github.com/gristlabs/grist-core>
Copyright Grist Labs Inc.
Licensed under the **Apache License, Version 2.0**. The full licence text is at
<https://www.apache.org/licenses/LICENSE-2.0> and is reproduced in `vendor/LICENSE-Apache-2.0.txt`.

The bundle Grist Labs publishes incorporates `events` (a browser port of Node's EventEmitter),
Copyright Joyent, Inc. and other Node contributors, under the MIT License (text below).

## Sortable 1.15.3

`vendor/Sortable.min.js` — <https://github.com/SortableJS/Sortable>
Copyright (c) 2019 All contributors to Sortable
Licensed under the **MIT License**:

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute,
> sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
> NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
> DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
> OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

---

Nothing else is fetched at view time. The widget makes no network requests of its own: it talks only
to the Grist document it is placed in, and the one outbound link is the ANUPRESS logo.
