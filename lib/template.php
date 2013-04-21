<?php if (!defined('SCRICH_VERSION')) { header('HTTP/1.0 403 Forbidden'); exit; } ?>
<!doctype html>
<?php $scrich_events->emit('template.after-doctype') ?>
<html>
	<head>
		<meta charset="utf-8">
		<title><?php if (isset($title)) { echo $title . ' | '; } ?>scri.ch</title>
<?php $scrich_events->emit('template.after-title') ?>
		<link rel="stylesheet" href="<?php echo SCRICH_URL ?>assets/scrich.css?<?php echo SCRICH_VERSION ?>">
		<link rel="icon" type="image/png" href="<?php echo SCRICH_URL ?>assets/favicon.png">
		<link rel="apple-touch-icon-precomposed" href="<?php echo SCRICH_URL ?>assets/apple-touch-icon-57x57-precomposed.png">
		<link rel="apple-touch-icon-precomposed" sizes="72x72" href="<?php echo SCRICH_URL ?>assets/apple-touch-icon-72x72-precomposed.png">
		<link rel="apple-touch-icon-precomposed" sizes="114x114" href="<?php echo SCRICH_URL ?>assets/apple-touch-icon-114x114-precomposed.png">
		<link rel="apple-touch-icon-precomposed" sizes="144x144" href="<?php echo SCRICH_URL ?>assets/apple-touch-icon-144x144-precomposed.png">
		<meta name="viewport" content="width=device-width; initial-scale=1.0; maximum-scale=1.0; user-scalable=no;">
		<style><?php if ($cur_img): ?>#save{display:none;}<?php else: ?>#buttons button,#about{display:none;}<?php endif; ?></style>
<?php $scrich_events->emit('template.after-styles') ?>
	</head>
	<body>
		<canvas id="drawing"></canvas>
		<div id="buttons">
			<button id="new">New</button>
			<button id="save">Save</button>
			<a href="http://about.scri.ch/" id="about" title="About scri.ch">?</a>
		</div>
		<form action="" method="post" id="form">
			<input type="hidden" id="new_drawing" name="new_drawing" value="">
			<input type="hidden" id="settings" name="settings" value="">
		</form>
<?php if ($cur_img): ?>
		<img id="img" src="<?php echo SCRICH_URL.$cur_img ?>.png" /><?php endif; ?>
		<script>
			var SCRICH_URL = '<?php echo SCRICH_URL ?>';
			var SCRICH_SETTINGS = <?php echo $scrich_settings ?>;
		</script>
		<script src="<?php echo SCRICH_URL ?>assets/scrich<?php if (!DEBUG): ?>-min<?php endif; ?>.js?<?php echo SCRICH_VERSION ?>"></script>
<?php $scrich_events->emit('template.after-scripts') ?>
	</body>
</html>
