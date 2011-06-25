<!doctype html>
<html>
	<head>
		<meta charset="utf-8">
		<title>scri.ch - Admin</title>
		<link rel="stylesheet" href="<?php echo SCRICH_URL ?>admin/css/admin.css?<?php echo SCRICH_VERSION ?>">
		<link rel="icon" type="image/png" href="<?php echo SCRICH_URL ?>favicon.png">
		<link rel="apple-touch-icon" href="<?php echo SCRICH_URL ?>apple-touch-icon.png">
	</head>
	<body>
		<h1>Drawings - <?php echo $page ?>/<?php echo $nb_pages ?> - (total <?php echo $draws_count ?>)</h1>
		<p class="pagination">
			<?php if ($page > 1): ?>
			<a href="<?php echo SCRICH_URL.'admin/?p='.($page-1) ?>" class="prev">Previous</a>
			<?php endif ?>
			<?php if ($page < $nb_pages): ?>
			<a href="<?php echo SCRICH_URL.'admin/?p='.($page+1) ?>" class="next">Next</a>
			<?php endif ?>
		</p>
		<ul id="draw-list">
			<?php foreach ($draws as $draw): ?>
			<li>
				<h2>/<?php echo $draw->short_id ?> <span>(<?php echo date("G:i j/m/Y", strtotime($draw->date)) ?>)</span></h2>
				<a href="<?php echo SCRICH_URL.$draw->short_id ?>">
					<img src="<?php echo SCRICH_URL.$draw->short_id ?>.png">
				</a>
			</li>
			<?php endforeach ?>
		</ul>
		<p class="pagination">
			<?php if ($page > 1): ?>
			<a href="<?php echo SCRICH_URL.'admin/?p='.($page-1) ?>" class="prev">Previous</a>
			<?php endif ?>
			<?php if ($page < $nb_pages): ?>
			<a href="<?php echo SCRICH_URL.'admin/?p='.($page+1) ?>" class="next">Next</a>
			<?php endif ?>
		</p>
	</body>
</html>