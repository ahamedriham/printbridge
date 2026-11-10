<?php

namespace PrintBridge\Laravel;

use Stringable;

/**
 * Server-side ESC/POS builder. Produces the same byte stream as the JS
 * PrintBridge.escpos() builder so receipts can be composed in Laravel and
 * handed to the browser as a raw print item.
 */
class EscPos implements Stringable
{
    public const ESC = "\x1B";
    public const GS = "\x1D";

    protected string $out = '';

    public function __construct(protected int $width = 42)
    {
    }

    public static function make(int $width = 42): static
    {
        return new static($width);
    }

    public function init(): static
    {
        return $this->raw(self::ESC.'@');
    }

    public function text(string $s): static
    {
        return $this->raw($s);
    }

    public function line(string $s = ''): static
    {
        return $this->raw($s."\n");
    }

    public function lines(iterable $lines): static
    {
        foreach ($lines as $l) {
            $this->line((string) $l);
        }

        return $this;
    }

    public function align(string $a): static
    {
        $map = ['left' => "\x00", 'center' => "\x01", 'right' => "\x02"];

        return $this->raw(self::ESC.'a'.($map[$a] ?? "\x00"));
    }

    public function bold(bool $on = true): static
    {
        return $this->raw(self::ESC.'E'.($on ? "\x01" : "\x00"));
    }

    public function underline(bool $on = true): static
    {
        return $this->raw(self::ESC.'-'.($on ? "\x01" : "\x00"));
    }

    /** Character size multipliers 1–8. */
    public function size(int $w = 1, int $h = 1): static
    {
        return $this->raw(self::GS.'!'.chr((($w - 1) << 4) | ($h - 1)));
    }

    public function feed(int $n = 1): static
    {
        return $this->raw(self::ESC.'d'.chr($n));
    }

    public function cut(bool $partial = false): static
    {
        return $this->raw(self::GS.'V'.($partial ? "\x01" : "\x00"));
    }

    /** Kick cash drawer on pin 0 or 1. */
    public function drawer(int $pin = 0): static
    {
        return $this->raw(self::ESC.'p'.chr($pin)."\x19\xFA");
    }

    /** ESC t n — select printer code page (e.g. 50 = cp1256 on Epson, 32 = cp720). */
    public function codepage(int $n): static
    {
        return $this->raw(self::ESC.'t'.chr($n));
    }

    /** Two-column line padded to the configured width. */
    public function row(string $left, string $right, ?int $width = null): static
    {
        $width ??= $this->width;
        $gap = $width - mb_strlen($left) - mb_strlen($right);

        return $this->raw($left.str_repeat(' ', max(1, $gap)).$right."\n");
    }

    public function separator(string $char = '-', ?int $width = null): static
    {
        return $this->line(str_repeat($char, $width ?? $this->width));
    }

    /** QR code (model 2). $size 1–16, $ec L|M|Q|H. */
    public function qr(string $data, int $size = 6, string $ec = 'M'): static
    {
        $ecv = ['L' => 48, 'M' => 49, 'Q' => 50, 'H' => 51][$ec] ?? 49;
        $len = strlen($data) + 3;
        $this->raw(self::GS."(k\x04\x00\x31\x41\x32\x00");
        $this->raw(self::GS."(k\x03\x00\x31\x43".chr($size));
        $this->raw(self::GS."(k\x03\x00\x31\x45".chr($ecv));
        $this->raw(self::GS.'(k'.chr($len & 0xFF).chr(($len >> 8) & 0xFF)."\x31\x50\x30".$data);
        $this->raw(self::GS."(k\x03\x00\x31\x51\x30");

        return $this;
    }

    /** 1D barcode. $type: UPC-A=65 UPC-E=66 EAN13=67 EAN8=68 CODE39=69 ITF=70 CODABAR=71 CODE93=72 CODE128=73 */
    public function barcode(string $data, int $type = 73, int $height = 60, int $width = 2, bool $hri = true): static
    {
        $this->raw(self::GS.'h'.chr($height));
        $this->raw(self::GS.'w'.chr($width));
        $this->raw(self::GS.'H'.chr($hri ? 2 : 0));
        if ($type === 73) {
            $data = '{B'.$data; // CODE128 set B
        }

        return $this->raw(self::GS.'k'.chr($type).chr(strlen($data)).$data);
    }

    public function raw(string $bytes): static
    {
        $this->out .= $bytes;

        return $this;
    }

    public function toString(): string
    {
        return $this->out;
    }

    public function toBase64(): string
    {
        return base64_encode($this->out);
    }

    /** As a PrintBridge raw data item (base64 so bytes survive JSON intact). */
    public function toItem(): array
    {
        return ['type' => 'raw', 'format' => 'base64', 'data' => $this->toBase64()];
    }

    public function __toString(): string
    {
        return $this->out;
    }
}
