test_inner = ->
	run_test [

		"inner(a,b)",
		"a*b",

		"inner(a,(b1,b2))",
		"(a*b1,a*b2)",

		"inner((a1,a2),b)",
		"(a1*b,a2*b)",

		"inner(((a11,a12),(a21,a22)),(x1,x2))",
		"(a11*x1+a12*x2,a21*x1+a22*x2)",

		"inner((1,2),(3,4))",
		"11",

		"inner(inner((1,2),((3,4),(5,6))),(7,8))",
		"219",

		"inner((1,2),inner(((3,4),(5,6)),(7,8)))",
		"219",

		"inner((1,2),((3,4),(5,6)),(7,8))",
		"219",
	]
