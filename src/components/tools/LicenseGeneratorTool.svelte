<script lang="ts">
  interface LicenseMeta {
    id: string;
    name: string;
    spdx: string;
    description: string;
    permissions: string[];
    conditions: string[];
    limitations: string[];
    needsProject: boolean;
    template: (year: string, fullname: string, project: string) => string;
  }

  const MIT_TEXT = (year: string, fullname: string): string => `MIT License

Copyright (c) ${year} ${fullname}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

  const APACHE_TEXT = (year: string, fullname: string): string => `                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   Copyright ${year} ${fullname}

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.

   Full license text: https://www.apache.org/licenses/LICENSE-2.0.txt
`;

  const GPL3_TEXT = (year: string, fullname: string, project: string): string => `${project || "This program"}
Copyright (C) ${year} ${fullname}

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

Full license text: https://www.gnu.org/licenses/gpl-3.0.txt
`;

  const BSD3_TEXT = (year: string, fullname: string): string => `BSD 3-Clause License

Copyright (c) ${year}, ${fullname}
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
`;

  const BSD2_TEXT = (year: string, fullname: string): string => `BSD 2-Clause License

Copyright (c) ${year}, ${fullname}
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
`;

  const BSD0_TEXT = (year: string, fullname: string): string => `BSD Zero Clause License

Copyright (c) ${year} ${fullname}

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
`;

  const ISC_TEXT = (year: string, fullname: string): string => `ISC License

Copyright (c) ${year} ${fullname}

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
`;

  const UNLICENSE_TEXT = (): string => `This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or distribute
this software, either in source code form or as a compiled binary, for any
purpose, commercial or non-commercial, and by any means.

In jurisdictions that recognize copyright laws, the author or authors of this
software dedicate any and all copyright interest in the software to the public
domain. We make this dedication for the benefit of the public at large and to
the detriment of our heirs and successors. We intend this dedication to be an
overt act of relinquishment in perpetuity of all present and future rights to
this software under copyright law.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

For more information, please refer to <https://unlicense.org/>
`;

  const WTFPL_TEXT = (year: string, fullname: string): string => `            DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
                    Version 2, December 2004

 Copyright (C) ${year} ${fullname}

 Everyone is permitted to copy and distribute verbatim or modified
 copies of this license document, and changing it is allowed as long
 as the name is changed.

            DO WHAT THE FUCK YOU WANT TO PUBLIC LICENSE
   TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

  0. You just DO WHAT THE FUCK YOU WANT TO.
`;

  const CC0_TEXT = (): string => `Creative Commons Legal Code

CC0 1.0 Universal

    CREATIVE COMMONS CORPORATION IS NOT A LAW FIRM AND DOES NOT PROVIDE
    LEGAL SERVICES. DISTRIBUTION OF THIS DOCUMENT DOES NOT CREATE AN
    ATTORNEY-CLIENT RELATIONSHIP. CREATIVE COMMONS PROVIDES THIS
    INFORMATION ON AN "AS-IS" BASIS. CREATIVE COMMONS MAKES NO WARRANTIES
    REGARDING THE USE OF THIS DOCUMENT OR THE INFORMATION OR WORKS
    PROVIDED HEREUNDER, AND DISCLAIMS LIABILITY FOR DAMAGES RESULTING FROM
    THE USE OF THIS DOCUMENT OR THE INFORMATION OR WORKS PROVIDED
    HEREUNDER.

Statement of Purpose

The person who associated a work with this deed has dedicated the work to
the public domain by waiving all of his or her rights to the work worldwide
under copyright law, including all related and neighboring rights, to the
extent allowed by law.

You can copy, modify, distribute and perform the work, even for commercial
purposes, all without asking permission.

Full license text: https://creativecommons.org/publicdomain/zero/1.0/legalcode
`;

  const BOOST_TEXT = (): string => `Boost Software License - Version 1.0 - August 17th, 2003

Permission is hereby granted, free of charge, to any person or organization
obtaining a copy of the software and accompanying documentation covered by
this license (the "Software") to use, reproduce, display, distribute,
execute, and transmit the Software, and to prepare derivative works of the
Software, and to permit third-parties to whom the Software is furnished to
do so, all subject to the following:

The copyright notices in the Software and this entire statement, including
the above license grant, this restriction and the following disclaimer,
must be included in all copies of the Software, in whole or in part, and
all derivative works of the Software, unless such copies or derivative
works are solely in the form of machine-executable object code generated by
a source language processor.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT. IN NO EVENT
SHALL THE COPYRIGHT HOLDERS OR ANYONE DISTRIBUTING THE SOFTWARE BE LIABLE
FOR ANY DAMAGES OR OTHER LIABILITY, WHETHER IN CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
`;

  const AGPL_TEXT = (year: string, fullname: string, project: string): string => `${project || "This program"}
Copyright (C) ${year} ${fullname}

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

Full license text: https://www.gnu.org/licenses/agpl-3.0.txt
`;

  const LGPL_TEXT = (year: string, fullname: string, project: string): string => `${project || "This library"}
Copyright (C) ${year} ${fullname}

This library is free software; you can redistribute it and/or
modify it under the terms of the GNU Lesser General Public
License as published by the Free Software Foundation; either
version 3 of the License, or (at your option) any later version.

This library is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
Lesser General Public License for more details.

You should have received a copy of the GNU Lesser General Public
License along with this library. If not, see <https://www.gnu.org/licenses/>.

Full license text: https://www.gnu.org/licenses/lgpl-3.0.txt
`;

  const JSON_TEXT = (year: string, fullname: string): string => `Copyright (c) ${year} ${fullname}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

The Software shall be used for Good, not Evil.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
`;

  const GLWTPL_TEXT = (year: string, fullname: string): string => `            GOOD LUCK WITH THAT PUBLIC LICENSE
                   Copyright (c) ${year} ${fullname}

Everyone is permitted to copy and distribute verbatim or modified copies of
this license document.

            GOOD LUCK WITH THAT PUBLIC LICENSE
   TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

  0. You just DO WHATEVER YOU WANT TO as long as you NEVER LEAVE A
TRACE TO TRACK THE AUTHOR of the original product to blame for or hold
responsible.

AUTHOR HAS ABSOLUTELY NO RESPONSIBILITY FOR ANY USE, MISUSE, OR ABUSE OF
THIS WORK WHATSOEVER.

Good luck and Godspeed.
`;

  const CDL_TEXT = (year: string, fullname: string): string => `                     CHICKEN DANCE LICENSE v0.2
                     Copyright (C) ${year} ${fullname}

Everyone is permitted to copy and distribute verbatim or modified copies
of this license document, and changing it is allowed as long as the name
is changed.

                     CHICKEN DANCE LICENSE

 TERMS AND CONDITIONS FOR COPYING, DISTRIBUTION AND MODIFICATION

 0. If the user of the Software becomes visible in a public setting and
    asked to do so, the user must perform the Chicken Dance for no less
    than 30 consecutive seconds, including flapping arms, hip wiggling,
    and clapping at the appropriate beats.

 1. If any organization uses the software for a commercial product, at
    least one member of the development team must perform the Chicken
    Dance at least once a year at a company function in full chicken
    attire.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.
`;

  const NPL_TEXT = (year: string, fullname: string): string => `            THE NICE PEOPLE LICENSE (NPL)
                 Copyright (c) ${year} ${fullname}

Permission is hereby granted to any nice person obtaining a copy of this
software to do pretty much whatever they want with it, provided that:

 1. You are, and remain, a nice person.
 2. You do not use this software to make the world a worse place.
 3. If you meet the author, you smile and say "thanks".
 4. You don't sue anyone over this software. That's not nice.

THE SOFTWARE IS PROVIDED "AS IS". IF IT BREAKS, YOU GET TO KEEP BOTH
PIECES. BE NICE ABOUT IT.
`;

  const CATWARE_TEXT = (year: string, fullname: string): string => `                     CAT-WARE LICENSE (Revision 9)
                      Copyright (c) ${year} ${fullname}

As long as you retain this notice you can do whatever you want with this
stuff. If we meet some day, and you think this stuff is worth it, you must
pet a cat in return. Any cat will do. The cat does not need to consent,
but is highly encouraged to.

If no cat is available in your vicinity, a dog is an acceptable substitute,
provided you apologize to the dog for it not being a cat.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, INCLUDING
BUT NOT LIMITED TO WARRANTIES OF PURRING, CUDDLING, OR KNOCKING THINGS OFF
TABLES.
`;

  const SQLITE_TEXT = (): string => `The author disclaims copyright to this source code. In place of a legal
notice, here is a blessing:

    May you do good and not evil.
    May you find forgiveness for yourself and forgive others.
    May you share freely, never taking more than you give.
`;

  const BEERWARE_TEXT = (fullname: string): string => `"THE BEER-WARE LICENSE" (Revision 42):

<${fullname}> wrote this file. As long as you retain this notice you
can do whatever you want with this stuff. If we meet some day, and you
think this stuff is worth it, you can buy me a beer in return.
`;

  const MPL_TEXT = (): string => `Mozilla Public License Version 2.0
==================================

This Source Code Form is subject to the terms of the Mozilla Public License,
v. 2.0. If a copy of the MPL was not distributed with this file, You can
obtain one at https://mozilla.org/MPL/2.0/.

Full license text: https://www.mozilla.org/en-US/MPL/2.0/
`;

  const licenses: LicenseMeta[] = [
    {
      id: "mit",
      name: "MIT",
      spdx: "MIT",
      description:
        "Short and simple permissive license — lets others do almost anything with your code as long as they credit you and don't hold you liable.",
      permissions: ["Commercial use", "Modification", "Distribution", "Private use"],
      conditions: ["License and copyright notice"],
      limitations: ["Liability", "Warranty"],
      needsProject: false,
      template: (y, f) => MIT_TEXT(y, f),
    },
    {
      id: "apache-2.0",
      name: "Apache 2.0",
      spdx: "Apache-2.0",
      description:
        "Permissive license similar to MIT but also provides an express grant of patent rights from contributors to users.",
      permissions: ["Commercial use", "Modification", "Distribution", "Patent use", "Private use"],
      conditions: ["License and copyright notice", "State changes"],
      limitations: ["Liability", "Warranty", "Trademark use"],
      needsProject: false,
      template: (y, f) => APACHE_TEXT(y, f),
    },
    {
      id: "gpl-3.0",
      name: "GPL 3.0",
      spdx: "GPL-3.0",
      description:
        "Strong copyleft license — derivatives must also be open source under the same license. Explicit patent grant.",
      permissions: ["Commercial use", "Modification", "Distribution", "Patent use", "Private use"],
      conditions: ["License and copyright notice", "State changes", "Disclose source", "Same license"],
      limitations: ["Liability", "Warranty"],
      needsProject: true,
      template: (y, f, p) => GPL3_TEXT(y, f, p),
    },
    {
      id: "bsd-3-clause",
      name: "BSD 3-Clause",
      spdx: "BSD-3-Clause",
      description:
        'Permissive license; adds a "no endorsement" clause forbidding use of the author\'s name to promote derivatives.',
      permissions: ["Commercial use", "Modification", "Distribution", "Private use"],
      conditions: ["License and copyright notice"],
      limitations: ["Liability", "Warranty"],
      needsProject: false,
      template: (y, f) => BSD3_TEXT(y, f),
    },
    {
      id: "bsd-2-clause",
      name: "BSD 2-Clause",
      spdx: "BSD-2-Clause",
      description:
        "Simplified permissive license — retain copyright notice in source and binary distributions.",
      permissions: ["Commercial use", "Modification", "Distribution", "Private use"],
      conditions: ["License and copyright notice"],
      limitations: ["Liability", "Warranty"],
      needsProject: false,
      template: (y, f) => BSD2_TEXT(y, f),
    },
    {
      id: "0bsd",
      name: "BSD Zero (0BSD)",
      spdx: "0BSD",
      description:
        "Effectively public domain — permission granted without any attribution requirement.",
      permissions: ["Commercial use", "Modification", "Distribution", "Private use"],
      conditions: [],
      limitations: ["Liability", "Warranty"],
      needsProject: false,
      template: (y, f) => BSD0_TEXT(y, f),
    },
    {
      id: "isc",
      name: "ISC",
      spdx: "ISC",
      description:
        "Functionally equivalent to MIT/BSD 2-Clause with simpler language. Used by OpenBSD and npm.",
      permissions: ["Commercial use", "Modification", "Distribution", "Private use"],
      conditions: ["License and copyright notice"],
      limitations: ["Liability", "Warranty"],
      needsProject: false,
      template: (y, f) => ISC_TEXT(y, f),
    },
    {
      id: "mpl-2.0",
      name: "MPL 2.0",
      spdx: "MPL-2.0",
      description:
        "File-level copyleft — modifications to MPL-licensed files must stay under MPL, but combined works can use another license.",
      permissions: ["Commercial use", "Modification", "Distribution", "Patent use", "Private use"],
      conditions: ["License and copyright notice", "Disclose source", "Same license (file)"],
      limitations: ["Liability", "Warranty", "Trademark use"],
      needsProject: false,
      template: () => MPL_TEXT(),
    },
    {
      id: "agpl-3.0",
      name: "AGPL 3.0",
      spdx: "AGPL-3.0",
      description:
        "Strongest copyleft — like GPL 3.0 but also requires source disclosure for network-based use (SaaS). Ideal for server-side apps you want to keep open.",
      permissions: ["Commercial use", "Modification", "Distribution", "Patent use", "Private use"],
      conditions: ["License and copyright notice", "State changes", "Disclose source", "Network use is distribution", "Same license"],
      limitations: ["Liability", "Warranty"],
      needsProject: true,
      template: (y, f, p) => AGPL_TEXT(y, f, p),
    },
    {
      id: "lgpl-3.0",
      name: "LGPL 3.0",
      spdx: "LGPL-3.0",
      description:
        "Weaker copyleft — libraries can be linked into proprietary software, but modifications to the library itself must stay open.",
      permissions: ["Commercial use", "Modification", "Distribution", "Patent use", "Private use"],
      conditions: ["License and copyright notice", "State changes", "Disclose source", "Same license (library)"],
      limitations: ["Liability", "Warranty"],
      needsProject: true,
      template: (y, f, p) => LGPL_TEXT(y, f, p),
    },
    {
      id: "boost-1.0",
      name: "Boost 1.0",
      spdx: "BSL-1.0",
      description:
        "Permissive license from the Boost C++ project — no attribution required for binary distributions, great for header-only libraries.",
      permissions: ["Commercial use", "Modification", "Distribution", "Private use"],
      conditions: ["License and copyright notice (source only)"],
      limitations: ["Liability", "Warranty"],
      needsProject: false,
      template: () => BOOST_TEXT(),
    },
    {
      id: "cc0-1.0",
      name: "CC0 1.0",
      spdx: "CC0-1.0",
      description:
        "Creative Commons public-domain dedication. Waive all copyright and related rights worldwide where legally possible.",
      permissions: ["Commercial use", "Modification", "Distribution", "Private use"],
      conditions: [],
      limitations: ["Liability", "Warranty", "Trademark use", "Patent use"],
      needsProject: false,
      template: () => CC0_TEXT(),
    },
    {
      id: "wtfpl",
      name: "WTFPL",
      spdx: "WTFPL",
      description:
        "Do What The Fuck You Want To Public License. Extremely permissive — one term: do what the fuck you want.",
      permissions: ["Commercial use", "Modification", "Distribution", "Private use"],
      conditions: [],
      limitations: ["Liability", "Warranty"],
      needsProject: false,
      template: (y, f) => WTFPL_TEXT(y, f),
    },
    {
      id: "json",
      name: "JSON",
      spdx: "JSON",
      description:
        "Douglas Crockford's infamous JSON license — MIT-like, but with the clause: \"The Software shall be used for Good, not Evil.\" IBM once had to ask permission to be evil.",
      permissions: ["Commercial use", "Modification", "Distribution", "Private use"],
      conditions: ["License and copyright notice", "Use for Good, not Evil"],
      limitations: ["Liability", "Warranty"],
      needsProject: false,
      template: (y, f) => JSON_TEXT(y, f),
    },
    {
      id: "glwtpl",
      name: "GLWTPL",
      spdx: "GLWTPL",
      description:
        "Good Luck With That Public License. For code so cursed you want to disavow all responsibility. \"Godspeed.\"",
      permissions: ["Commercial use", "Modification", "Distribution", "Private use"],
      conditions: ["Never trace back to the author"],
      limitations: ["Liability", "Warranty", "Any support whatsoever"],
      needsProject: false,
      template: (y, f) => GLWTPL_TEXT(y, f),
    },
    {
      id: "chicken-dance",
      name: "Chicken Dance",
      spdx: "CDL-1.0",
      description:
        "Free to use — as long as you perform the Chicken Dance in public on request, or annually at a company function in full chicken attire for commercial users.",
      permissions: ["Commercial use", "Modification", "Distribution", "Private use"],
      conditions: ["Perform the Chicken Dance", "Chicken attire (commercial use)"],
      limitations: ["Liability", "Warranty", "Dignity"],
      needsProject: false,
      template: (y, f) => CDL_TEXT(y, f),
    },
    {
      id: "nice-people",
      name: "Nice People",
      spdx: "NPL",
      description:
        "The Nice People License. You can do anything with the software as long as you remain, fundamentally, a nice person.",
      permissions: ["Commercial use", "Modification", "Distribution", "Private use"],
      conditions: ["Be nice", "Don't make the world worse", "Say thanks"],
      limitations: ["Liability", "Warranty", "Lawsuits (not nice)"],
      needsProject: false,
      template: (y, f) => NPL_TEXT(y, f),
    },
    {
      id: "catware",
      name: "Catware",
      spdx: "Catware",
      description:
        "Like Beerware, but with cats. Free to use, but if we meet you must pet a cat. Dogs accepted with apology.",
      permissions: ["Commercial use", "Modification", "Distribution", "Private use"],
      conditions: ["Pet a cat (if we meet)"],
      limitations: ["Liability", "Warranty", "Purring guaranteed"],
      needsProject: false,
      template: (y, f) => CATWARE_TEXT(y, f),
    },
    {
      id: "sqlite-blessing",
      name: "SQLite Blessing",
      spdx: "blessing",
      description:
        "SQLite's public-domain dedication. No legal notice — just a short blessing: may you do good, forgive, and share freely.",
      permissions: ["Commercial use", "Modification", "Distribution", "Private use"],
      conditions: [],
      limitations: ["Liability", "Warranty"],
      needsProject: false,
      template: () => SQLITE_TEXT(),
    },
    {
      id: "beerware",
      name: "Beerware",
      spdx: "Beerware",
      description:
        "Joke license by Poul-Henning Kamp. Do whatever you want; if we meet and you like the code, you can buy me a beer.",
      permissions: ["Commercial use", "Modification", "Distribution", "Private use"],
      conditions: ["Retain notice", "Beer (if we meet)"],
      limitations: ["Liability", "Warranty"],
      needsProject: false,
      template: (_y, f) => BEERWARE_TEXT(f || "your-email@example.com"),
    },
    {
      id: "unlicense",
      name: "Unlicense",
      spdx: "Unlicense",
      description:
        "Dedicate your code to the public domain. No attribution required, no restrictions.",
      permissions: ["Commercial use", "Modification", "Distribution", "Private use"],
      conditions: [],
      limitations: ["Liability", "Warranty"],
      needsProject: false,
      template: () => UNLICENSE_TEXT(),
    },
  ];

  let selectedId = $state<string>("mit");
  let year = $state<string>(String(new Date().getFullYear()));
  let fullname = $state<string>("");
  let project = $state<string>("");
  let copied = $state(false);

  let selected = $derived(licenses.find((l) => l.id === selectedId) ?? licenses[0]);
  let output = $derived(selected.template(year || String(new Date().getFullYear()), fullname || "<copyright holder>", project || "<project name>"));

  const handleCopy = () => {
    navigator.clipboard.writeText(output);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  };

  const handleDownload = () => {
    const blob = new Blob([output], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "LICENSE";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
</script>

<div class="h-full flex flex-col">
  <header class="mb-4">
    <p class="text-sm text-(--color-text-muted)">
      Generate a LICENSE file for your GitHub project. Fill in the copyright info, pick a license, then copy or download the file.
    </p>
  </header>

  <div class="mb-4 flex flex-col gap-4">
    <!-- License picker -->
    <div>
      <label for="license-select" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
        License
      </label>
      <select
        id="license-select"
        bind:value={selectedId}
        class="w-full lg:max-w-md px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent) cursor-pointer"
      >
        <optgroup label="Popular">
          {#each licenses.filter((l) => ["mit", "apache-2.0", "gpl-3.0", "bsd-3-clause", "bsd-2-clause", "isc", "mpl-2.0"].includes(l.id)) as lic}
            <option value={lic.id}>{lic.name} ({lic.spdx})</option>
          {/each}
        </optgroup>
        <optgroup label="Copyleft & Other">
          {#each licenses.filter((l) => ["agpl-3.0", "lgpl-3.0", "boost-1.0", "0bsd", "cc0-1.0", "unlicense"].includes(l.id)) as lic}
            <option value={lic.id}>{lic.name} ({lic.spdx})</option>
          {/each}
        </optgroup>
        <optgroup label="Joke & Novelty">
          {#each licenses.filter((l) => ["wtfpl", "json", "glwtpl", "chicken-dance", "nice-people", "catware", "beerware", "sqlite-blessing"].includes(l.id)) as lic}
            <option value={lic.id}>{lic.name} ({lic.spdx})</option>
          {/each}
        </optgroup>
      </select>
    </div>

    <!-- Params -->
    <div class="flex flex-row flex-wrap gap-4 items-end">
      <div>
        <label for="year-input" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
          Year
        </label>
        <input
          id="year-input"
          type="text"
          bind:value={year}
          class="w-28 px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
        />
      </div>
      <div class="flex-1 min-w-[240px]">
        <label for="name-input" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
          Copyright holder
        </label>
        <input
          id="name-input"
          type="text"
          bind:value={fullname}
          placeholder="Your Name or Organization"
          class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
        />
      </div>
      {#if selected.needsProject}
        <div class="flex-1 min-w-[240px]">
          <label for="project-input" class="block text-xs tracking-wider text-(--color-text-light) font-medium mb-2">
            Project name & description
          </label>
          <input
            id="project-input"
            type="text"
            bind:value={project}
            placeholder="MyProject - short description"
            class="w-full px-3 py-2 border border-(--color-border) bg-(--color-bg-alt) text-(--color-text) text-sm focus:outline-none focus:border-(--color-accent)"
          />
        </div>
      {/if}
    </div>

    <!-- Info panel -->
    <div class="px-4 py-3 border border-(--color-border) bg-(--color-bg-alt)">
      <div class="flex items-baseline gap-2 mb-2">
        <h2 class="text-sm font-semibold text-(--color-text)">{selected.name}</h2>
        <span class="text-xs text-(--color-text-muted) font-mono">SPDX: {selected.spdx}</span>
      </div>
      <p class="text-sm text-(--color-text-muted) mb-3">{selected.description}</p>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <div class="text-xs uppercase tracking-wider text-green-500 font-semibold mb-1">Permissions</div>
          {#if selected.permissions.length === 0}
            <div class="text-xs text-(--color-text-muted)">—</div>
          {:else}
            <ul class="text-xs text-(--color-text) space-y-0.5">
              {#each selected.permissions as p}
                <li>✓ {p}</li>
              {/each}
            </ul>
          {/if}
        </div>
        <div>
          <div class="text-xs uppercase tracking-wider text-blue-500 font-semibold mb-1">Conditions</div>
          {#if selected.conditions.length === 0}
            <div class="text-xs text-(--color-text-muted)">None</div>
          {:else}
            <ul class="text-xs text-(--color-text) space-y-0.5">
              {#each selected.conditions as c}
                <li>• {c}</li>
              {/each}
            </ul>
          {/if}
        </div>
        <div>
          <div class="text-xs uppercase tracking-wider text-red-500 font-semibold mb-1">Limitations</div>
          {#if selected.limitations.length === 0}
            <div class="text-xs text-(--color-text-muted)">—</div>
          {:else}
            <ul class="text-xs text-(--color-text) space-y-0.5">
              {#each selected.limitations as l}
                <li>✗ {l}</li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- Output -->
  <div class="flex-1 flex flex-col min-h-[240px]">
    <div class="flex justify-between items-center mb-2">
      <span class="text-xs uppercase tracking-wider text-(--color-text-light) font-medium">
        LICENSE Preview
      </span>
      <div class="flex gap-3">
        <button
          onclick={handleCopy}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors {copied ? 'text-(--color-accent)' : ''}"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
        <button
          onclick={handleDownload}
          class="text-xs text-(--color-text-muted) hover:text-(--color-text) transition-colors"
        >
          Download LICENSE
        </button>
      </div>
    </div>
    <textarea
      readonly
      value={output}
      class="flex-1 w-full p-3 border border-(--color-border) bg-(--color-bg) text-(--color-text) text-xs font-mono resize-none focus:outline-none focus:border-(--color-accent)"
    ></textarea>
  </div>
</div>
