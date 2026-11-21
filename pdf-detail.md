Below is a typography and layout specification you can use to recreate this receipt in your Electron application.
5 embedded fonts found
Text is extractable
1 page

Property

Extracted value

Page format

Custom

Width

216 pt (3 inches)

Height

576 pt (8 inches)

Width in mm

76.2 mm

Height in mm

203.2 mm

Orientation

Portrait

Pages

1

PDF version

1.7

Color mode

Primarily black text

PDF creator

Affinity 3.3.0

PDF producer

PDFlib+PDI 10.0.0p1-i
This is a custom 3 × 8-inch receipt layout, not a standard A4 or Letter document.
Confirmed from embedded PDF fonts

Font family

Style

PDF font size

Usage

Consolas

Regular

5.34–7.71 pt

Main receipt text

Consolas

Bold

5.34–5.74 pt

Headings, labels, totals

Bookman Old Style

Regular

6.50–6.89 pt

Horizontal separators

Calibri

Regular

7.71 pt

Phone numbers

Microsoft Sans Serif

Regular

4.23 pt

Small R symbol
Most important discovery: Consolas is the primary typeface. It is a monospaced font, which explains the receipt's character alignment and column formatting.
[Six safe fonts to use in your presentations | PDF](https://images.openai.com/static-rsc-4/Uon0hlVuPC4r3vnUkl3KzMUgLG7Fmt0dkD9gSUtbarqlWqrtySpWSFeWol7Lit0kdUzi1lJrGIyU66R49hN8ERBdGigGXU9bS3xiYO1yVHpEn_6yQ_AQqdj7Z2kL_kkEHbeQGKtyHKXqBPmtnuhbXTMX0dFAHkQVo8Le1xKw2_g?purpose=inline)
Consolas Regular

Main receipt content
[What are the best Web Fonts? - IONOS](https://images.openai.com/static-rsc-4/46x-yBj69m08egS_8xEGJyBFLT1xee2ztAAg_MYJl20r5Gi6lXu_xzW8i3k0TOHcjMCAd_Die36zxkA601Fdvb6yzGSOL6M2axoEeDmFpxt5TTwBFTwEnoaErPt_MlB-etTq8S1TTYK429MS1yS1cT1Y6f2evC5j-J5A8h8FKjY?purpose=inline)
Consolas Bold

Headings and totals
All five font files were successfully extracted from the PDF. This means the PDF contains actual embedded font programs, not merely references to fonts installed on the original computer.
These are the actual extracted sizes, in PDF points (pt).

Receipt section

Font

Size

Store name

Consolas Regular

5.70 pt

Store address

Consolas Regular

5.70 pt

Date and time

Consolas Regular

5.68 pt

Column headings

Consolas Bold

5.74 pt

Product name

Consolas Bold

5.34 pt

Quantity

Consolas Regular

5.34 pt

Product price

Consolas Regular

5.34 pt

Destination address

Consolas Regular

5.34 pt

Delivery information

Consolas Regular

5.34 pt

Tracking label

Consolas Bold

5.34 pt

Tracking number

Consolas Regular

5.34 pt

Subtotal and total labels

Consolas Bold

5.34 pt

Total amounts

Consolas / Bold

5.34 pt

Footer instructions

Consolas Regular

7.71 pt

Footer phone numbers

Calibri Regular

7.71 pt
One important distinction: these are PDF font sizes, not CSS pixels. At 96 DPI, 5.34 pt is approximately 7.12 CSS pixels.
I extracted the bounding boxes and text coordinates of the individual text elements.

The PDF uses a coordinate system measured from its top-left corner, with measurements in points.

Here are the main layout positions:

Element

X position

Y position

Store name

97.06 pt

93.91 pt

Store address

64.21 pt

100.71 pt

Store location

95.49 pt

108.60 pt

Date

6.39 pt

137.34 pt

Time

188.60 pt

136.60 pt

Product heading

8.17 pt

150.63 pt

Product name

6.29 pt

170.46 pt

Destination

11.25 pt

181.63 pt

Expected delivery

10.72 pt

188.59 pt

Tracking label

10.95 pt

211.52 pt

Tracking number

26.35 pt

218.72 pt

Total

5.52 pt

265.73 pt

Grand total

5.51 pt

287.49 pt
The footer uses approximately 10.05 pt between successive lines.

Other notable measurements:
- Store name to address: approximately 6.8 pt.
- Address to city/state: approximately 7.9 pt.
- Date to table heading: approximately 13–14 pt.
- Product name to destination: approximately 11.2 pt.
- Destination to delivery label: approximately 7 pt.
- Delivery label to delivery date: approximately 8 pt.
- Tracking label to tracking number: approximately 7.2 pt.
These are measured coordinate differences, not necessarily CSS margin values.
The receipt uses a four-column structure.

Column

Approximate X position

Product

8 pt

Quantity

130 pt

Unit price

163 pt

Price

195 pt
The date and time are aligned independently, with the time positioned near the right edge.

The product and total amounts are also positioned independently rather than relying on a conventional HTML table.

Recommendation: Use a fixed-width layout with CSS Grid or Flexbox. Use Consolas for predictable character widths.
[Receipt print order aligning - V4 Question - SambaClub Forum](https://images.openai.com/static-rsc-4/LickP4lPmuQHO-_nKsvPsoi0TmpjhgBKOUP_jBNZgF8qZLBDrmmrPfUAGLSJgmHYWE_2UFCnOMaFxCLTUKX2Cx86RHdLhR6qP-or-O5MwcHHvLICLb47qzS-fl12YFmfvo9MkRUphPoCueaWXv_TyTfT-Ogun92yCVyvjQSPAMo?purpose=inline)
[forum.sambapos.com](https://forum.sambapos.com/t/receipt-print-order-aligning/3543?utm_source=chatgpt.com)
I found:
- Multiple horizontal dashed separators.
- Three principal separator positions around the product table and totals.
- Additional separator lines around the grand total.
- A small logo composed of vector paths.
- A red horizontal graphical line.
- No embedded raster images.
An interesting detail: the dashed separators are actually text glyphs rendered using Bookman Old Style, not ordinary CSS borders.

For a faithful recreation, you should reproduce their visual appearance rather than assume they are border-bottom elements.
The footer is visually different from the main receipt.

It uses:
- Consolas Regular, 7.71 pt.
- Calibri Regular, 7.71 pt, for phone numbers.
- Center-aligned text.
- Approximately 10.05 pt vertical baseline intervals.
There are two separate footer paragraphs, with a larger gap between them.
These are the actual internal PDF font names:

Internal PDF name

Actual font

BVRHQK+MicrosoftSansSerif

Microsoft Sans Serif

IOUBIU+BookmanOldStyle

Bookman Old Style

QAHPEP+Consolas

Consolas

KKGOVE+Consolas-Bold

Consolas Bold

NFQRTP+Calibri

Calibri
The prefixes such as QAHPEP+ are PDF subset identifiers. They aren't part of the actual font family names.

Property

Status

Font families


Identified


Font weights


Identified


Font sizes


Extracted


Page dimensions


Exact


Text positions


Extracted


Horizontal alignment


Extracted


Line spacing


Measured


Separator positioning


Extracted


Logo geometry


Vector data found


Exact CSS margins/padding


Not directly available


Original application layout rules


Not available


Printer-specific rendering


Not verified

If you're recreating this receipt in your Electron application, I'd use the following starting configuration:
Receipt configuration

Setting

Value

Width

76.2 mm

Height

203.2 mm

Main font

Consolas

Main font size

5.34 pt

Header font size

5.70 pt

Footer font size

7.71 pt

Bold font

Consolas Bold

Text color

#000000

Background

#FFFFFF

Main alignment

Fixed columns

Footer alignment

Center

Main line spacing

Content-dependent

Footer line spacing

10.05 pt
 Copy specification
Since you're recreating receipts in your Electron application, I recommend going one step further: build a complete pixel-level layout specification.

That would include:
1. Every text element's exact X/Y coordinates.
2. Width and height of each text bounding box.
3. Individual character positioning where available.
4. Exact horizontal and vertical gaps.
5. Logo vector geometry and positioning.
6. Separator lengths and positions.
7. A complete section-by-section layout blueprint.
This would give your development agent a much more precise reference than simply telling it to use Consolas and a 3-inch receipt.

Source: Direct inspection of your uploaded PDF, including its embedded font resources, text spans, bounding boxes and vector drawing objects. 
amzon biling1(1).pdf
