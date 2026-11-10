<?php

namespace PrintBridge\Laravel\Tests;

use Illuminate\Support\Facades\Blade;
use Orchestra\Testbench\TestCase;
use PrintBridge\Laravel\Facades\PrintBridge;
use PrintBridge\Laravel\PrintBridgeServiceProvider;

class ServiceProviderTest extends TestCase
{
    protected function getPackageProviders($app): array
    {
        return [PrintBridgeServiceProvider::class];
    }

    protected function getPackageAliases($app): array
    {
        return ['PrintBridge' => PrintBridge::class];
    }

    protected function defineEnvironment($app): void
    {
        $app['config']->set('printbridge.default_printer', 'EPSON');
        $app['config']->set('printbridge.encoding', 'cp1256');
    }

    public function test_script_route_serves_client(): void
    {
        $response = $this->get('/vendor/printbridge/printbridge.js')
            ->assertOk()
            ->assertHeader('Content-Type', 'application/javascript');
        $this->assertStringContainsString('PrintBridge', $response->baseResponse->getFile()->getContent());
    }

    public function test_blade_directive_renders_script_and_config(): void
    {
        $html = Blade::render('@printbridge');
        $this->assertStringContainsString('<script src="http://localhost/vendor/printbridge/printbridge.js"></script>', $html);
        $this->assertStringContainsString('window.PRINTBRIDGE_CONFIG = {"connect":{"host":"localhost","wsPort":8182,"wssPort":8181},"defaultPrinter":"EPSON"', $html);
        $this->assertStringContainsString('PrintBridge.connect(', $html);

        $noAuto = Blade::render("@printbridge(['autoConnect' => false])");
        $this->assertStringNotContainsString('PrintBridge.connect(', $noAuto);
    }

    public function test_facade_job_uses_defaults(): void
    {
        $job = PrintBridge::job()->raw(PrintBridge::escpos()->line('hi'))->toArray();
        $this->assertSame('EPSON', $job['config']['printer']);
        $this->assertSame('cp1256', $job['config']['encoding']);
    }

    public function test_receipt_view_renders(): void
    {
        $html = PrintBridge::job()->size(80, 200)->view('printbridge::receipt', [
            'store' => ['name' => 'Silky Store'],
            'items' => [['name' => 'Coffee', 'qty' => 2, 'total' => 20]],
            'totals' => ['subtotal' => 20, 'vat' => 3, 'total' => 23],
        ])->toArray();
        $this->assertStringContainsString('Silky Store', $html['data'][0]['data']);
        $this->assertStringContainsString('23.00 SAR', $html['data'][0]['data']);
    }
}
