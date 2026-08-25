
# KJubilee Band Structure

## Overview

The KJubilee HM band (300.00 to 399.99) is divided into five blocks of twenty whole numbers. Each block corresponds to one of the five-fold ministry offices and carries a distinct type of programming.

The office labels are internal. Listeners see the block names only.

## The Five Blocks

| Block Name      | Office     | Range            | Programming                                |
| --------------- | ---------- | ---------------- | ------------------------------------------ |
| The Crossing    | Evangelist | 300.00 to 319.99 | Domestic, English, gospel-forward music    |
| The Nations     | Apostle    | 320.00 to 339.99 | International music, languages and nations |
| The Upper Room  | Prophet    | 340.00 to 359.99 | Prayer and intercession                    |
| The Living Room | Shepherd   | 360.00 to 379.99 | Family-friendly programming                |
| The Table       | Teacher    | 380.00 to 399.99 | Talk shows and teaching                    |

## Block Colours

Each block carries one identity colour. The colour is the block, not the station: a station takes its block colour wherever the band structure is being shown, so a listener learns the five by sight before they learn them by name.

| Block           | Colour      | On light  | On dark   |
| --------------- | ----------- | --------- | --------- |
| The Crossing    | Azure blue  | `#1F6FB8` | `#5CB0FF` |
| The Nations     | Purple      | `#6A44A6` | `#B69CFF` |
| The Upper Room  | Maroon red  | `#8E2A3A` | `#F08795` |
| The Living Room | Green       | `#3E7B4B` | `#79CE92` |
| The Table       | Gold yellow | `#94690E` | `#EFC44F` |

Two values per block, because one hex cannot serve both grounds. A gold dark enough to read on white goes muddy on near-black; a maroon light enough to read on near-black goes pink on white. The light values sit at or above roughly 4.5:1 on white; the dark values are lifted to hold on `#161920`.

These are block identity, and are separate from the per-format ident gradients the station covers already use. A station keeps its own artwork; the block colour is the frame around it.

## Ordering Rationale

The blocks are not ordered by the Ephesians sequence. They are ordered by listener journey, ascending the band:

1. **The Crossing.** A new listener lands at the low end and meets music that draws them in. This is the front door.
2. **The Nations.** The frame widens outward to the languages and cultures of the world.
3. **The Upper Room.** The listener is taken deeper, into prayer.
4. **The Living Room.** Care, family, and nurture.
5. **The Table.** Teaching and substance at the top of the band.

Read bottom to top, the band itself traces a discipleship path.

## Function, Not Format

Blocks are defined by the direction a station is aimed, not by its medium.

Music appears in both The Crossing and The Nations. This is intentional and is not a duplication. Music ministry is understood as outreach, which places it under the evangelistic office; international music is placed under the apostolic office because the apostolic mark is sending and reaching the nations. Same medium, different office, distinguished by function.

## Addressing Scheme

The decimal is addressing space, not decoration.

- Whole number: office block and station within that block
- Decimal digits: sub-genre or city variant
- Total capacity: 10,000 station slots across 300.00 to 399.99

Example: **311.42** reads as The Crossing block, station eleven, variant forty two.

Because the platform is digital, precision is affordable. Growth should be structured into the decimal space rather than appended arbitrarily.

## Flagship

The flagship station remains at **308.70**, inside The Crossing. This is appropriate: the front door station carries the brand.

If 308.70 becomes an established number the audience knows, it is not to be renumbered later for the sake of a tidier scheme. The scheme bends around the flagship, not the reverse.

## Open Items

**Renumbering the existing lineup.** The current 101 stations were assigned before the block structure existed, so some now sit in the wrong office. This mapping work should be done once, and done soon, while the audience is small. Renumbering costs far more later.

**The 101st station.** The lineup does not divide evenly into five blocks of twenty. Recommended handling is to treat the extra as an overflow or special-purpose station rather than forcing it into The Table.
