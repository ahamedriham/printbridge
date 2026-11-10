<?php

namespace PrintBridge\Laravel\Tests;

use PHPUnit\Framework\TestCase;
use PrintBridge\Laravel\EscPos;
use PrintBridge\Laravel\PrintJob;

class EscPosTest extends TestCase
{
    public function test_matches_js_builder_bytes(): void
    {
        $s = EscPos::make()->init()->align('center')->bold()->line('HI')->bold(false)->cut()->toString();
        $this->assertSame("\x1B@\x1Ba\x01\x1BE\x01HI\n\x1BE\x00\x1DV\x00", $s);
    }

    public function test_row_padding(): void
    {
        $this->assertSame("Item    1.00\n", EscPos::make(12)->row('Item', '1.00')->toString());
    }

    public function test_qr_and_drawer(): void
    {
        $this->assertStringContainsString("\x1D(k\x06\x00\x31\x50\x30abc", EscPos::make()->qr('abc')->toString());
        $this->assertSame("\x1Bp\x00\x19\xFA", EscPos::make()->drawer()->toString());
    }

    public function test_item_is_base64(): void
    {
        $item = EscPos::make()->line('x')->toItem();
        $this->assertSame(['type' => 'raw', 'format' => 'base64', 'data' => base64_encode("x\n")], $item);
    }

    public function test_print_job_serialises(): void
    {
        $job = (new PrintJob(['encoding' => 'cp1256']))
            ->printer('EPSON')
            ->copies(2)
            ->raw(EscPos::make()->line('a'))
            ->html('<b>x</b>')
            ->size(80, 200)
            ->noMargins();

        $arr = $job->toArray();
        $this->assertSame('EPSON', $arr['config']['printer']);
        $this->assertSame('cp1256', $arr['config']['encoding']);
        $this->assertSame(0, $arr['config']['margins']);
        $this->assertSame(['width' => 80.0, 'height' => 200.0], $arr['config']['size']);
        $this->assertCount(2, $arr['data']);
        $this->assertSame('pixel', $arr['data'][1]['type']);

        $net = (new PrintJob)->network('10.0.0.5')->toArray();
        $this->assertSame(['host' => '10.0.0.5', 'port' => 9100], $net['config']);
    }
}
