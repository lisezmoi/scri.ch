<?php
require_once './lib/scrich.php';

$drawing_m = new DrawingModel();
$drawings = $drawing_m->get_all_grouped_by_date();

?><!doctype html>
<html>
	<head>
	<title>Stats</title>
	<script type="text/javascript" src="https://www.google.com/jsapi"></script>
	<script type="text/javascript">
		var drawings = <?php echo json_encode($drawings); ?>;
		google.load("visualization", "1", {packages:["corechart"]});
		function drawChart(chart, title, anomalies) {
			var data = new google.visualization.DataTable();
			data.addColumn('string', 'Day');
			data.addColumn('number', 'Scriches');
			data.addRows(drawings.length);

			for (var i=0; i < drawings.length; i++) {
				if (!anomalies && drawings[i].total > 1000) {
					continue;
				}
				data.setValue(i, 0, drawings[i].date_day);
				data.setValue(i, 1, drawings[i].total-0);
			}

			chart.draw(data, {width: window.innerWidth, height: 500, title: title});
		}
		function getChart(id) {
			return new google.visualization.LineChart(document.getElementById(id));
		}
		google.setOnLoadCallback(function(){
			drawChart(getChart('chart_div_1'), 'All stats', true);
			drawChart(getChart('chart_div_2'), 'All stats without anomalies (> 1000 drawings)', false);
		});
	</script>
</head>
<body>
	<div id="chart_div_1"></div>
	<div id="chart_div_2"></div>
</body>
</html>
