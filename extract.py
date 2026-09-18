# -*- coding: utf-8 -*-
"""Schneidet benannte Top-Level-Funktionen samt vorangehendem Kommentarblock
aus index.html heraus. Kommentare wandern mit - sie sind in diesem Repo der
wertvollste Teil des Codes."""
import io, re

def load(p='index.html'):
    return io.open(p, encoding='utf-8').read().split('\n')

def find_func(lines, name):
    """(start, end) inkl. vorangehender Kommentarzeilen, 0-basiert, end inklusiv."""
    pat = re.compile(r'^(?:async\s+)?function\s+' + re.escape(name) + r'\s*\(')
    for i, l in enumerate(lines):
        if pat.match(l):
            # Klammerbilanz bis zum Ende
            depth = 0; started = False; j = i
            while j < len(lines):
                depth += lines[j].count('{') - lines[j].count('}')
                if '{' in lines[j]:
                    started = True
                if started and depth <= 0:
                    break
                j += 1
            # Kommentarblock davor einsammeln
            s = i
            while s > 0 and lines[s-1].strip().startswith('//'):
                s -= 1
            return s, j
    return None

def find_var(lines, name):
    pat = re.compile(r'^var\s+' + re.escape(name) + r'\s*=')
    for i, l in enumerate(lines):
        if pat.match(l):
            s = i
            while s > 0 and lines[s-1].strip().startswith('//'):
                s -= 1
            return s, i
    return None

def cut(lines, specs):
    """specs: Liste von Namen (Funktionen) oder ('var', name).
    Gibt (neue_zeilen, extrahierter_text) zurueck. Schneidet von hinten,
    damit fruehere Indizes gueltig bleiben."""
    ranges = []
    for sp in specs:
        if isinstance(sp, tuple) and sp[0] == 'var':
            r = find_var(lines, sp[1])
            label = 'var ' + sp[1]
        else:
            r = find_func(lines, sp)
            label = 'function ' + sp
        if r is None:
            raise SystemExit('NICHT GEFUNDEN: ' + label)
        ranges.append((r[0], r[1], label))
    # Ueberlappungen wuerden Code doppelt schneiden
    ranges.sort()
    for a, b in zip(ranges, ranges[1:]):
        if a[1] >= b[0]:
            raise SystemExit('UEBERLAPPUNG: %s und %s' % (a[2], b[2]))
    taken = []
    out = list(lines)
    for s, e, label in sorted(ranges, reverse=True):
        taken.append('\n'.join(out[s:e+1]))
        del out[s:e+1]
    taken.reverse()
    return out, taken, ranges
