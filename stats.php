<?php
require_once './lib/scrich.php';

$drawing_m = new DrawingModel();
$drawings = $drawing_m->get_all_grouped_by_date();

?><!doctype html>
<html>
	<head>
	<title></title>
	<script type="text/javascript" src="https://www.google.com/jsapi"></script>
	<script type="text/javascript">
		var drawings = <?php echo json_encode($drawings); ?>;
		google.load("visualization", "1", {packages:["corechart"]});
		function drawChart(chart, title, megaday) {
			var data = new google.visualization.DataTable();
			data.addColumn('string', 'Day');
			data.addColumn('number', 'Drawings');
			data.addRows(drawings.length);
			for (var i=0; i < drawings.length; i++) {
				if (!megaday && i === 1) continue;
				data.setValue(i, 0, drawings[i].date_day);
				data.setValue(i, 1, drawings[i].total-0);
			}
			chart.draw(data, {width: window.innerWidth, height: 500, title: title});
		}
		function getChart(id) {
			return new google.visualization.LineChart(document.getElementById(id));
		}
		google.setOnLoadCallback(function(){
			drawChart(getChart('chart'), 'Drawings by day', true);
		});
	</script>
</head>
<body>
	<div id="chart"></div>
</body>
</html>