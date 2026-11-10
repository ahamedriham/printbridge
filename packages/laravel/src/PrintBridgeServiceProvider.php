<?php

namespace PrintBridge\Laravel;

use Illuminate\Support\Facades\Blade;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class PrintBridgeServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->mergeConfigFrom(__DIR__.'/../config/printbridge.php', 'printbridge');

        $this->app->singleton(PrintBridgeManager::class, fn ($app) => new PrintBridgeManager($app['config']['printbridge']));
        $this->app->alias(PrintBridgeManager::class, 'printbridge');
    }

    public function boot(): void
    {
        $this->publishes([
            __DIR__.'/../config/printbridge.php' => config_path('printbridge.php'),
        ], 'printbridge-config');

        $this->publishes([
            __DIR__.'/../resources/js/printbridge.js' => public_path('vendor/printbridge/printbridge.js'),
        ], 'printbridge-assets');

        $this->publishes([
            __DIR__.'/../resources/views' => resource_path('views/vendor/printbridge'),
        ], 'printbridge-views');

        $this->loadViewsFrom(__DIR__.'/../resources/views', 'printbridge');

        $this->registerRoute();
        $this->registerBladeDirectives();
    }

    protected function registerRoute(): void
    {
        $path = config('printbridge.route_path', 'vendor/printbridge/printbridge.js');

        Route::get($path, function () {
            $file = __DIR__.'/../resources/js/printbridge.js';

            return response()->file($file, [
                'Content-Type' => 'application/javascript',
                'Cache-Control' => 'public, max-age=86400',
            ]);
        })->name('printbridge.script');
    }

    protected function registerBladeDirectives(): void
    {
        // <script src=…></script> + optional auto-connect
        Blade::directive('printbridge', function ($expression) {
            return "<?php echo app('printbridge')->scriptTag({$expression}); ?>";
        });

        // window.PRINTBRIDGE_CONFIG = {...}
        Blade::directive('printbridgeConfig', function () {
            return "<?php echo app('printbridge')->configScript(); ?>";
        });
    }
}
